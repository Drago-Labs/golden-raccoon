import { buildBlendCoverage } from "./coverage";
import { BlendPositionError, type BlendPositionState } from "./errors";
import { computeHealthFactor, valuePositionWithFactors } from "./healthFactor";
import { BLEND_POSITION_LIMITS } from "./limits";
import { computeLiquidationScenarios } from "./liquidationScenarios";
import { assertSamePool, isSupportedBlendNetwork } from "./networkIdentity";
import {
  createDefaultOraclePriceReader,
  findMissingOracleAssets,
  type OraclePriceProvider,
} from "./oraclePrices";
import { createDefaultPoolConfigReader, type PoolConfigProvider } from "./poolConfigReader";
import { createDefaultPositionReader, type PositionProvider } from "./positionReader";
import {
  convertBTokenToUnderlying,
  convertDTokenToUnderlying,
  formatTokenUnits,
  toDecimalNumber,
} from "./rateIndex";
import {
  blendPositionRequestSchema,
  type BlendPositionReport,
  type ConvertedPosition,
} from "./schema";

export type BlendServiceDeps = {
  poolConfigProvider?: PoolConfigProvider;
  positionProvider?: PositionProvider;
  oraclePriceProvider?: OraclePriceProvider;
};

export async function explainBlendPositions(
  rawInput: unknown,
  deps: BlendServiceDeps = {},
): Promise<BlendPositionReport> {
  const parsed = blendPositionRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new BlendPositionError("Invalid Blend position request", "invalid_request", false);
  }
  const input = parsed.data;
  if (!isSupportedBlendNetwork(input.network)) {
    throw new BlendPositionError(`Unsupported network: ${input.network}`, "unsupported_network", false);
  }

  const poolProvider = deps.poolConfigProvider ?? createDefaultPoolConfigReader();
  const posProvider = deps.positionProvider ?? createDefaultPositionReader();
  const oracleProvider = deps.oraclePriceProvider ?? createDefaultOraclePriceReader();

  let reserves;
  let accountPositions;
  try {
    [reserves, accountPositions] = await Promise.all([
      poolProvider.readPoolReserves({ poolId: input.poolId, network: input.network }),
      posProvider.readAccountPositions({
        poolId: input.poolId,
        accountId: input.accountId,
        network: input.network,
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Blend RPC provider unavailable";
    return {
      network: input.network,
      poolId: input.poolId,
      accountId: input.accountId,
      state: "unavailable",
      ledger: null,
      positions: [],
      health: {
        available: false,
        unavailableReason: message,
        totalSupplyUsd: null,
        totalBorrowUsd: null,
        effectiveCollateralUsd: null,
        effectiveLiabilityUsd: null,
        healthFactor: null,
        status: "unavailable",
      },
      scenarios: [],
      coverage: buildBlendCoverage({
        reachedProvider: false,
        ledger: null,
        reservesConfigured: 0,
        positionsFound: 0,
        missingOracleAssets: [],
        message,
      }),
      warnings: [message],
    };
  }

  assertSamePool(input.poolId, accountPositions.poolId, "Account position snapshot");
  for (const reserve of reserves) {
    assertSamePool(input.poolId, reserve.poolId, `Reserve ${reserve.symbol}`);
  }
  for (const entry of accountPositions.entries) {
    assertSamePool(input.poolId, entry.poolId, `Position entry ${entry.assetId}`);
  }

  const boundedReserves = reserves.slice(0, BLEND_POSITION_LIMITS.maxReserves);
  const reserveByAsset = new Map(boundedReserves.map((r) => [r.assetId, r]));

  const activeEntries = accountPositions.entries.filter(
    (e) => BigInt(e.bTokensRaw) > 0n || BigInt(e.dTokensRaw) > 0n,
  );
  const activeAssetIds = activeEntries.map((e) => e.assetId);

  const oracleEntries = await oracleProvider.readOraclePrices({
    poolId: input.poolId,
    assetIds: activeAssetIds,
    network: input.network,
  });

  const { priceByAsset, missingAssets } = findMissingOracleAssets(activeAssetIds, oracleEntries);

  const positions: ConvertedPosition[] = [];
  for (const entry of activeEntries) {
    const reserve = reserveByAsset.get(entry.assetId);
    if (!reserve) continue;
    const underlyingSupply = convertBTokenToUnderlying(entry.bTokensRaw, reserve.bRateRaw);
    const underlyingBorrow = convertDTokenToUnderlying(entry.dTokensRaw, reserve.dRateRaw);
    const supplyTokens = toDecimalNumber(underlyingSupply, reserve.decimals);
    const borrowTokens = toDecimalNumber(underlyingBorrow, reserve.decimals);
    const priceUsd = priceByAsset.get(entry.assetId) ?? null;

    const valuation = valuePositionWithFactors({
      supplyTokens,
      borrowTokens,
      priceUsd,
      collateralFactorBps: reserve.collateralFactorBps,
      liabilityFactorBps: reserve.liabilityFactorBps,
    });

    positions.push({
      poolId: input.poolId,
      assetId: entry.assetId,
      symbol: reserve.symbol,
      decimals: reserve.decimals,
      bTokensRaw: entry.bTokensRaw,
      dTokensRaw: entry.dTokensRaw,
      bRateRaw: reserve.bRateRaw,
      dRateRaw: reserve.dRateRaw,
      underlyingSupplyRaw: underlyingSupply.toString(),
      underlyingBorrowRaw: underlyingBorrow.toString(),
      underlyingSupplyFormatted: formatTokenUnits(underlyingSupply, reserve.decimals),
      underlyingBorrowFormatted: formatTokenUnits(underlyingBorrow, reserve.decimals),
      collateralFactorBps: reserve.collateralFactorBps,
      liabilityFactorBps: reserve.liabilityFactorBps,
      priceUsd,
      ...valuation,
    });
  }

  const health = computeHealthFactor(positions, missingAssets);
  const scenarios = computeLiquidationScenarios(positions, health);

  const warnings: string[] = [];
  if (missingAssets.length > 0) {
    warnings.push(`Oracle price missing for ${missingAssets.join(", ")}; health factor left unavailable.`);
  }

  const state: BlendPositionState = missingAssets.length > 0 ? "partial" : "complete";

  return {
    network: input.network,
    poolId: input.poolId,
    accountId: input.accountId,
    state,
    ledger: accountPositions.ledger,
    positions,
    health,
    scenarios,
    coverage: buildBlendCoverage({
      reachedProvider: true,
      ledger: accountPositions.ledger,
      reservesConfigured: boundedReserves.length,
      positionsFound: positions.length,
      missingOracleAssets: missingAssets,
      message:
        missingAssets.length > 0
          ? "Positions loaded, but missing oracle prices prevent health factor calculation."
          : "All pool reserves, positions, and oracle prices verified at ledger.",
    }),
    warnings,
  };
}
