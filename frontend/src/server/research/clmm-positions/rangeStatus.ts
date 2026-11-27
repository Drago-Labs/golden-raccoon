import {
  adjustedPriceFromTick,
  percentDistance,
  priceFromTick,
} from "./tickMath";
import type { RangeStatus, RangeStatusKind } from "./schema";

export function computeRangeStatus(input: {
  tickCurrent: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  token0Decimals: number;
  token1Decimals: number;
}): RangeStatus {
  const closed = input.liquidity === 0n;
  let status: RangeStatusKind;
  if (closed) {
    status = "closed";
  } else if (input.tickCurrent < input.tickLower) {
    status = "out_of_range_below";
  } else if (input.tickCurrent >= input.tickUpper) {
    status = "out_of_range_above";
  } else {
    status = "in_range";
  }

  const currentPrice = adjustedPriceFromTick(
    input.tickCurrent,
    input.token0Decimals,
    input.token1Decimals,
  );
  const priceLower = adjustedPriceFromTick(
    input.tickLower,
    input.token0Decimals,
    input.token1Decimals,
  );
  const priceUpper = adjustedPriceFromTick(
    input.tickUpper,
    input.token0Decimals,
    input.token1Decimals,
  );

  const distanceToLowerPercent = closed ? null : percentDistance(currentPrice, priceLower);
  const distanceToUpperPercent = closed ? null : percentDistance(currentPrice, priceUpper);

  let nearestBound: "lower" | "upper" | null = null;
  let distanceToNearestBoundPercent: string | null = null;

  if (!closed) {
    if (status === "out_of_range_below") {
      nearestBound = "lower";
      distanceToNearestBoundPercent = distanceToLowerPercent;
    } else if (status === "out_of_range_above") {
      nearestBound = "upper";
      distanceToNearestBoundPercent = distanceToUpperPercent;
    } else {
      const lowerAbs = Math.abs(Number(distanceToLowerPercent));
      const upperAbs = Math.abs(Number(distanceToUpperPercent));
      if (lowerAbs <= upperAbs) {
        nearestBound = "lower";
        distanceToNearestBoundPercent = distanceToLowerPercent;
      } else {
        nearestBound = "upper";
        distanceToNearestBoundPercent = distanceToUpperPercent;
      }
    }
  }

  return {
    status,
    inRange: status === "in_range",
    currentTick: input.tickCurrent,
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
    currentPrice,
    priceLower,
    priceUpper,
    distanceToLowerPercent,
    distanceToUpperPercent,
    distanceToNearestBoundPercent,
    nearestBound,
  };
}

/** Text alternative for the range visual (accessibility). */
export function rangeStatusSummary(range: RangeStatus, liquidity: string): string {
  if (range.status === "closed") {
    return `Closed position with zero liquidity. Historical tick range ${range.tickLower} to ${range.tickUpper}.`;
  }
  if (range.status === "in_range") {
    return `In range. Current tick ${range.currentTick} is between ${range.tickLower} and ${range.tickUpper}. Liquidity ${liquidity}.`;
  }
  const bound = range.nearestBound ?? "nearest";
  const distance = range.distanceToNearestBoundPercent ?? "unknown";
  const side = range.status === "out_of_range_below" ? "below" : "above";
  return `Out of range (${side}). Current tick ${range.currentTick}; range ${range.tickLower} to ${range.tickUpper}. Distance to ${bound} bound: ${distance}%.`;
}

export function rawPriceFromTick(tick: number): string {
  return priceFromTick(tick);
}
