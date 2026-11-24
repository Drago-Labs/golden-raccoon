import { describe, expect, it } from "vitest";
import { computeRangeStatus, rangeStatusSummary } from "@/server/research/clmm-positions/rangeStatus";
import { closedFixture, inRangeFixture, outOfRangeFixture } from "./fixtures";

describe("rangeStatus", () => {
  it("marks the in-range fixture as in range", () => {
    const range = computeRangeStatus({
      tickCurrent: inRangeFixture.pool!.tick,
      tickLower: inRangeFixture.position!.tickLower,
      tickUpper: inRangeFixture.position!.tickUpper,
      liquidity: BigInt(inRangeFixture.position!.liquidity),
      token0Decimals: 18,
      token1Decimals: 18,
    });
    expect(range.status).toBe(inRangeFixture.expected.status);
    expect(range.inRange).toBe(true);
    expect(range.distanceToNearestBoundPercent).toBe(inRangeFixture.expected.distanceToNearestBoundPercent);
    expect(range.nearestBound).toBe(inRangeFixture.expected.nearestBound);
  });

  it("reports distance to the nearest bound when out of range", () => {
    const range = computeRangeStatus({
      tickCurrent: outOfRangeFixture.pool!.tick,
      tickLower: outOfRangeFixture.position!.tickLower,
      tickUpper: outOfRangeFixture.position!.tickUpper,
      liquidity: BigInt(outOfRangeFixture.position!.liquidity),
      token0Decimals: 18,
      token1Decimals: 18,
    });
    expect(range.status).toBe("out_of_range_above");
    expect(range.inRange).toBe(false);
    expect(range.nearestBound).toBe("upper");
    expect(range.distanceToNearestBoundPercent).toBe(outOfRangeFixture.expected.distanceToNearestBoundPercent);
    expect(rangeStatusSummary(range, outOfRangeFixture.position!.liquidity)).toMatch(/Out of range/);
  });

  it("marks closed positions explicitly", () => {
    const range = computeRangeStatus({
      tickCurrent: closedFixture.pool!.tick,
      tickLower: closedFixture.position!.tickLower,
      tickUpper: closedFixture.position!.tickUpper,
      liquidity: 0n,
      token0Decimals: 18,
      token1Decimals: 18,
    });
    expect(range.status).toBe("closed");
    expect(range.distanceToNearestBoundPercent).toBeNull();
  });
});
