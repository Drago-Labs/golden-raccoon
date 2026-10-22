import { resolveVaultNetwork } from "./chainIdentity";
import { assessConformance } from "./conformance";
import { computeSharePrice } from "./conversions";
import { buildCoverage } from "./coverage";
import { VaultAccountingError } from "./errors";
import { PRICE_SAMPLE_POINTS } from "./limits";
import { detectJumps, planSampleBlocks } from "./priceSampling";
import { assessRounding } from "./rounding";
import { compareUnderlyingBalance } from "./underlyingBalance";
import {
  createHttpVaultRpc,
  readConvertToAssets,
  readErc20Balance,
  readPreviewDeposit,
  readPreviewRedeem,
  readVaultCore,
  type VaultRpc,
} from "./vaultReader";
import type { SharePricePoint, VaultAccountingRequest, VaultAccountingResult } from "./schema";

async function samplePricePoint(rpc: VaultRpc, vault: string, block: bigint): Promise<SharePricePoint> {
  const core = await readVaultCore(rpc, vault, block);
  return { blockNumber: Number(block), sharePrice: computeSharePrice(core.totalAssets, core.totalSupply) };
}

export async function inspectVaultAccounting(
  input: VaultAccountingRequest,
  deps: { rpc?: VaultRpc } = {},
): Promise<VaultAccountingResult> {
  const network = resolveVaultNetwork(input.network);
  if (!network) {
    throw new VaultAccountingError("Unsupported network", "unsupported_network", false);
  }

  const rpc = deps.rpc ?? createHttpVaultRpc(network.rpcUrl);
  const warnings: string[] = [];

  try {
    const block = input.blockNumber !== undefined ? BigInt(input.blockNumber) : await rpc.blockNumber();

    const core = await readVaultCore(rpc, input.vaultAddress, block);

    // A zero-amount probe exists purely to test whether each function
    // responds at all; its value is never used for accounting.
    const [convertProbe, previewDepositProbe, previewRedeemProbe] = await Promise.all([
      readConvertToAssets(rpc, input.vaultAddress, 0n, block),
      readPreviewDeposit(rpc, input.vaultAddress, 0n, block),
      readPreviewRedeem(rpc, input.vaultAddress, 0n, block),
    ]);
    const conformance = assessConformance({
      asset: core.asset,
      totalAssets: core.totalAssets,
      totalSupply: core.totalSupply,
      convertToAssetsAvailable: convertProbe !== null,
      previewDepositAvailable: previewDepositProbe !== null,
      previewRedeemAvailable: previewRedeemProbe !== null,
    });
    if (!conformance.conforming) {
      warnings.push(`Non-conforming vault: missing ${conformance.missing.join(", ")}.`);
    }

    const sharePrice = computeSharePrice(core.totalAssets, core.totalSupply);

    const roundingSamples = await Promise.all(
      input.sampleAmounts.map(async (raw) => {
        const amount = BigInt(raw);
        const sharesFromDeposit = await readPreviewDeposit(rpc, input.vaultAddress, amount, block);
        const assetsRoundTrip =
          sharesFromDeposit !== null ? await readConvertToAssets(rpc, input.vaultAddress, sharesFromDeposit, block) : null;
        return assessRounding(amount, sharesFromDeposit, assetsRoundTrip);
      }),
    );

    const underlyingBalance =
      core.asset !== null
        ? compareUnderlyingBalance(core.totalAssets, await readErc20Balance(rpc, core.asset, input.vaultAddress, block))
        : null;
    if (core.asset === null) {
      warnings.push("Could not determine the underlying asset; the balance comparison was skipped.");
    }

    const sampleBlocks = planSampleBlocks(block);
    const priceSamples = await Promise.all(sampleBlocks.map((b) => samplePricePoint(rpc, input.vaultAddress, b)));
    const priceJumps = detectJumps(priceSamples);
    if (priceSamples.length < PRICE_SAMPLE_POINTS) {
      warnings.push("The price-history window was truncated because the chain has fewer blocks than the full window.");
    }

    const coverage = buildCoverage({
      reachedProvider: true,
      conformance,
      roundingSamplesRequested: input.sampleAmounts.length,
      roundingSamples,
      priceSamplesRequested: PRICE_SAMPLE_POINTS,
      priceSamples,
    });

    const incomplete =
      !conformance.conforming ||
      roundingSamples.some((s) => s.direction === "unavailable") ||
      priceSamples.some((p) => p.sharePrice === null) ||
      (core.asset !== null && underlyingBalance?.actualBalance === null);

    return {
      network: input.network,
      vaultAddress: input.vaultAddress,
      blockNumber: Number(block),
      state: incomplete ? "partial" : "complete",
      conformance,
      asset: core.asset,
      totalAssets: core.totalAssets?.toString() ?? null,
      totalSupply: core.totalSupply?.toString() ?? null,
      sharePrice,
      roundingSamples,
      underlyingBalance,
      priceSamples,
      priceJumps,
      coverage,
      warnings,
    };
  } catch (error) {
    return {
      network: input.network,
      vaultAddress: input.vaultAddress,
      blockNumber: null,
      state: "unavailable",
      conformance: { conforming: false, missing: [] },
      asset: null,
      totalAssets: null,
      totalSupply: null,
      sharePrice: null,
      roundingSamples: [],
      underlyingBalance: null,
      priceSamples: [],
      priceJumps: [],
      coverage: {
        reachedProvider: false,
        conformance: { conforming: false, missing: [] },
        roundingSamplesRequested: input.sampleAmounts.length,
        roundingSamplesAvailable: 0,
        priceSamplesRequested: PRICE_SAMPLE_POINTS,
        priceSamplesAvailable: 0,
      },
      warnings: [error instanceof Error ? error.message : "Provider unavailable"],
    };
  }
}
