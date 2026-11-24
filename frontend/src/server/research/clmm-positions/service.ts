import { normalizeClmmAddress } from "./addressInput";
import { amountsForPosition, formatTokenAmount } from "./amounts";
import { coverageLines, coverageNotice } from "./coverage";
import { deploymentFor } from "./deployments";
import { ClmmPositionsError } from "./errors";
import { boundedPageSize, CLMM_POSITIONS_LIMITS } from "./limits";
import { defaultPoolStateReader, type PoolStateReader } from "./poolState";
import {
  defaultPositionReader,
  isClosedPosition,
  type PositionReader,
  type RawPosition,
} from "./positionReader";
import { computeRangeStatus } from "./rangeStatus";
import {
  CLMM_POSITIONS_SCHEMA_VERSION,
  clmmPositionsRequestSchema,
  type ClmmPositionsReport,
  type ExplainedPosition,
  type PositionTotals,
} from "./schema";
import { uncollectedFees } from "./uncollectedFees";

export type ClmmPositionsDeps = {
  readPositions: PositionReader;
  readPool: PoolStateReader;
};

const productionDeps: ClmmPositionsDeps = {
  readPositions: defaultPositionReader,
  readPool: defaultPoolStateReader,
};

function emptyTotals(): PositionTotals {
  return {
    openPositions: 0,
    closedPositions: 0,
    inRangePositions: 0,
    outOfRangePositions: 0,
    amount0: "0",
    amount1: "0",
    fees0: "0",
    fees1: "0",
  };
}

function unavailableReport(
  address: string,
  network: string,
  deploymentLabel: string,
  reason: string,
): ClmmPositionsReport {
  const state = "unavailable" as const;
  return {
    schemaVersion: CLMM_POSITIONS_SCHEMA_VERSION,
    address,
    network,
    deployment: deploymentLabel,
    state,
    positions: [],
    totals: emptyTotals(),
    coverageNotice: coverageNotice(state, [reason]),
    coverage: coverageLines({
      state,
      positionSource: false,
      poolSource: false,
      deploymentLabel,
    }),
    nextCursor: null,
    readOnly: true,
  };
}

function explainPosition(
  raw: RawPosition,
  pool: {
    sqrtPriceX96: string;
    tick: number;
    feeGrowthGlobal0X128: string;
    feeGrowthGlobal1X128: string;
    tickLowerData: { feeGrowthOutside0X128: string; feeGrowthOutside1X128: string };
    tickUpperData: { feeGrowthOutside0X128: string; feeGrowthOutside1X128: string };
    token0Symbol: string;
    token1Symbol: string;
    token0Decimals: number;
    token1Decimals: number;
  },
): ExplainedPosition {
  const liquidity = BigInt(raw.liquidity);
  const closed = isClosedPosition(raw);
  const amounts = amountsForPosition({
    tickCurrent: pool.tick,
    tickLower: raw.tickLower,
    tickUpper: raw.tickUpper,
    liquidity,
    sqrtPriceX96: BigInt(pool.sqrtPriceX96),
  });
  const fees = uncollectedFees({
    tickCurrent: pool.tick,
    tickLower: raw.tickLower,
    tickUpper: raw.tickUpper,
    liquidity,
    feeGrowthGlobal0X128: BigInt(pool.feeGrowthGlobal0X128),
    feeGrowthGlobal1X128: BigInt(pool.feeGrowthGlobal1X128),
    tickLowerData: {
      feeGrowthOutside0X128: BigInt(pool.tickLowerData.feeGrowthOutside0X128),
      feeGrowthOutside1X128: BigInt(pool.tickLowerData.feeGrowthOutside1X128),
    },
    tickUpperData: {
      feeGrowthOutside0X128: BigInt(pool.tickUpperData.feeGrowthOutside0X128),
      feeGrowthOutside1X128: BigInt(pool.tickUpperData.feeGrowthOutside1X128),
    },
    feeGrowthInside0LastX128: BigInt(raw.feeGrowthInside0LastX128),
    feeGrowthInside1LastX128: BigInt(raw.feeGrowthInside1LastX128),
    tokensOwed0: BigInt(raw.tokensOwed0),
    tokensOwed1: BigInt(raw.tokensOwed1),
  });
  const range = computeRangeStatus({
    tickCurrent: pool.tick,
    tickLower: raw.tickLower,
    tickUpper: raw.tickUpper,
    liquidity,
    token0Decimals: pool.token0Decimals,
    token1Decimals: pool.token1Decimals,
  });

  return {
    tokenId: raw.tokenId,
    pool: raw.pool,
    token0: raw.token0,
    token1: raw.token1,
    token0Symbol: pool.token0Symbol,
    token1Symbol: pool.token1Symbol,
    token0Decimals: pool.token0Decimals,
    token1Decimals: pool.token1Decimals,
    feeTierBps: raw.fee / 100,
    tickLower: raw.tickLower,
    tickUpper: raw.tickUpper,
    liquidity: raw.liquidity,
    closed,
    amounts: {
      amount0: formatTokenAmount(amounts.amount0, pool.token0Decimals),
      amount1: formatTokenAmount(amounts.amount1, pool.token1Decimals),
      amount0Raw: amounts.amount0.toString(),
      amount1Raw: amounts.amount1.toString(),
    },
    fees: {
      token0: formatTokenAmount(fees.token0, pool.token0Decimals),
      token1: formatTokenAmount(fees.token1, pool.token1Decimals),
      token0Raw: fees.token0.toString(),
      token1Raw: fees.token1.toString(),
    },
    range,
  };
}

function accumulateTotals(positions: ExplainedPosition[]): PositionTotals {
  let amount0 = 0n;
  let amount1 = 0n;
  let fees0 = 0n;
  let fees1 = 0n;
  let openPositions = 0;
  let closedPositions = 0;
  let inRangePositions = 0;
  let outOfRangePositions = 0;

  for (const position of positions) {
    if (position.closed) {
      closedPositions += 1;
      continue;
    }
    openPositions += 1;
    if (position.range.inRange) inRangePositions += 1;
    else outOfRangePositions += 1;
    amount0 += BigInt(position.amounts.amount0Raw);
    amount1 += BigInt(position.amounts.amount1Raw);
    fees0 += BigInt(position.fees.token0Raw);
    fees1 += BigInt(position.fees.token1Raw);
  }

  // Totals use raw units; formatting keeps the first open position's decimals when present.
  const sample = positions.find((p) => !p.closed) ?? positions[0];
  const d0 = sample?.token0Decimals ?? 18;
  const d1 = sample?.token1Decimals ?? 18;

  return {
    openPositions,
    closedPositions,
    inRangePositions,
    outOfRangePositions,
    amount0: formatTokenAmount(amount0, d0),
    amount1: formatTokenAmount(amount1, d1),
    fees0: formatTokenAmount(fees0, d0),
    fees1: formatTokenAmount(fees1, d1),
  };
}

export async function explainClmmPositions(
  input: unknown,
  deps: ClmmPositionsDeps = productionDeps,
): Promise<ClmmPositionsReport> {
  const parsed = clmmPositionsRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ClmmPositionsError("invalid_request", "The request is invalid.", parsed.error.flatten());
  }

  const address = normalizeClmmAddress(parsed.data.address);
  const network = parsed.data.network;
  const deployment = deploymentFor(network);
  if (!deployment) {
    throw new ClmmPositionsError("unsupported_deployment", `Unsupported network: ${network}`);
  }

  const pageSize = boundedPageSize(parsed.data.pageSize);
  const read = await deps.readPositions({
    address,
    network,
    npmAddress: deployment.npmAddress,
    pageSize,
    cursor: parsed.data.cursor,
  });

  if (read.status === "unavailable") {
    return unavailableReport(address, network, deployment.label, read.reason);
  }

  if (read.positions.length > CLMM_POSITIONS_LIMITS.maxPositions) {
    throw new ClmmPositionsError("response_too_large", "Too many positions in the response page.");
  }

  const explained: ExplainedPosition[] = [];
  const gaps: string[] = [];

  for (const raw of read.positions) {
    const poolRead = await deps.readPool({
      network,
      pool: raw.pool,
      tickLower: raw.tickLower,
      tickUpper: raw.tickUpper,
    });
    if (poolRead.status === "unavailable") {
      gaps.push(`pool ${raw.pool}: ${poolRead.reason}`);
      continue;
    }
    explained.push(explainPosition(raw, poolRead.pool));
  }

  const state = gaps.length > 0 ? (explained.length === 0 ? "unavailable" : "partial") : "complete";
  if (state === "unavailable") {
    return unavailableReport(address, network, deployment.label, gaps[0] ?? "No pool state available.");
  }

  return {
    schemaVersion: CLMM_POSITIONS_SCHEMA_VERSION,
    address,
    network,
    deployment: deployment.label,
    state,
    positions: explained,
    totals: accumulateTotals(explained),
    coverageNotice: coverageNotice(state, gaps),
    coverage: coverageLines({
      state,
      positionSource: true,
      poolSource: gaps.length === 0,
      deploymentLabel: deployment.label,
    }),
    nextCursor: read.nextCursor,
    readOnly: true,
  };
}
