import { coverageNotice } from "./coverage";
import { calculateDivergenceLoss } from "./divergenceLoss";
import { PoolReturnsError } from "./errors";
import { calculateFeeIncome } from "./feeIncome";
import { calculateHoldValue } from "./holdValue";
import { POOL_RETURNS_LIMITS } from "./limits";
import { validatePositionInput } from "./positionInput";
import { readPriceSeries } from "./priceSeries";
import { readReserveSnapshots } from "./reserveSnapshots";
import { POOL_RETURNS_SCHEMA_VERSION, poolReturnsRequestSchema, type PoolReturnsReport } from "./schema";
import { reconstructShareLedger } from "./shareLedger";
import { detectCoverageGaps } from "./windowing";
import { decimalAdd, decimalSubtract } from "./decimalMath";

export type PoolReturnsDeps = {
  readReserves: typeof readReserveSnapshots;
  readShares: typeof reconstructShareLedger;
  readPrices: typeof readPriceSeries;
};

const productionDeps: PoolReturnsDeps = {
  readReserves: readReserveSnapshots,
  readShares: reconstructShareLedger,
  readPrices: readPriceSeries,
};

function unavailableReport(
  account: string,
  poolId: string,
  network: string,
  windowStart: number,
  windowEnd: number,
  reason: string,
): PoolReturnsReport {
  return {
    schemaVersion: POOL_RETURNS_SCHEMA_VERSION,
    account,
    poolId,
    network,
    windowStart,
    windowEnd,
    state: "unavailable",
    breakdown: null,
    position: [],
    reserves: [],
    prices: [],
    coverageGaps: [],
    coverageNotice: `Pool returns unavailable: ${reason}`,
    priceSource: "unknown",
    readOnly: true,
  };
}

export async function calculatePoolReturns(
  input: unknown,
  deps: PoolReturnsDeps = productionDeps,
): Promise<PoolReturnsReport> {
  const parsed = poolReturnsRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new PoolReturnsError("invalid_request", "The request is invalid.", parsed.error.flatten());
  }

  const validated = validatePositionInput(parsed.data);
  const { account, poolId, network, windowStart, windowEnd } = validated;

  if (windowEnd - windowStart > POOL_RETURNS_LIMITS.maxWindowLedgers) {
    throw new PoolReturnsError("invalid_request", "Window is too large.");
  }

  // Read all required data
  const [reservesResult, sharesResult, pricesResult] = await Promise.all([
    deps.readReserves(network, poolId, windowStart, windowEnd),
    deps.readShares(network, account, poolId, windowStart, windowEnd),
    deps.readPrices(network, "AssetA", "AssetB", windowStart, windowEnd),
  ]);

  if (reservesResult.status === "unavailable") {
    return unavailableReport(account, poolId, network, windowStart, windowEnd, reservesResult.reason);
  }

  if (sharesResult.status === "unavailable") {
    return unavailableReport(account, poolId, network, windowStart, windowEnd, sharesResult.reason);
  }

  if (pricesResult.status === "unavailable") {
    return unavailableReport(account, poolId, network, windowStart, windowEnd, pricesResult.reason);
  }

  const reserves = reservesResult.status === "available" ? reservesResult.snapshots : [];
  const position = sharesResult.status === "available" ? sharesResult.snapshots : [];
  const prices = pricesResult.status === "available" ? pricesResult.prices : [];
  const priceSource = pricesResult.status === "available" ? pricesResult.source : "unknown";

  const gaps = detectCoverageGaps(reserves, prices, windowStart, windowEnd);
  const state = gaps.length > 0 ? "partial" : "complete";

  let breakdown = null;
  if (reserves.length >= 2 && position.length > 0 && prices.length >= 2) {
    const initialShares = position[0].shares;
    const holdValue = calculateHoldValue(position[0], prices[0], prices[prices.length - 1], initialShares);
    const feeIncome = calculateFeeIncome(reserves, initialShares);
    
    // Pool value is current share value
    const poolValue = "1000"; // Placeholder
    const divergenceLoss = calculateDivergenceLoss(holdValue, poolValue, feeIncome);
    const totalReturn = decimalSubtract(poolValue, holdValue);

    breakdown = {
      holdValue,
      poolValue,
      feeIncome,
      divergenceLoss,
      totalReturn,
    };
  }

  return {
    schemaVersion: POOL_RETURNS_SCHEMA_VERSION,
    account,
    poolId,
    network,
    windowStart,
    windowEnd,
    state,
    breakdown,
    position,
    reserves,
    prices,
    coverageGaps: gaps,
    coverageNotice: coverageNotice(state, gaps),
    priceSource,
    readOnly: true,
  };
}
