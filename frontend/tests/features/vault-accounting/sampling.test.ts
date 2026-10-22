import { describe, expect, it } from "vitest";
import { detectJumps, planSampleBlocks } from "@/server/research/vault-accounting/priceSampling";
import { SHARE_PRICE_SCALE } from "@/server/research/vault-accounting/limits";
import type { SharePricePoint } from "@/server/research/vault-accounting/schema";

function point(blockNumber: number, assetsPerShareScaled: bigint | null): SharePricePoint {
  return {
    blockNumber,
    sharePrice: assetsPerShareScaled === null ? null : { assetsPerShareScaled: assetsPerShareScaled.toString(), scale: SHARE_PRICE_SCALE.toString() },
  };
}

describe("planSampleBlocks", () => {
  it("returns evenly spaced blocks covering the full window, oldest first", () => {
    const blocks = planSampleBlocks(1_000n, 5, 1_000n);
    expect(blocks).toEqual([0n, 250n, 500n, 750n, 1_000n]);
  });

  it("clamps the window start at block 0 for a chain younger than the window", () => {
    const blocks = planSampleBlocks(10n, 5, 1_000n);
    expect(blocks[0]).toBe(0n);
    expect(blocks[blocks.length - 1]).toBe(10n);
  });

  it("returns just the end block when only one point is requested", () => {
    expect(planSampleBlocks(500n, 1, 1_000n)).toEqual([500n]);
  });

  it("de-duplicates offsets that collapse onto the same block for a short span", () => {
    const blocks = planSampleBlocks(2n, 5, 1_000n);
    expect(new Set(blocks).size).toBe(blocks.length);
    expect(blocks[blocks.length - 1]).toBe(2n);
  });
});

describe("detectJumps", () => {
  it("flags a consecutive move at or above the threshold", () => {
    const points = [point(1, 1_000_000n), point(2, 1_100_000n)]; // +10%
    const jumps = detectJumps(points, 500); // 5% threshold
    expect(jumps).toEqual([{ fromBlock: 1, toBlock: 2, changeBps: 1_000 }]);
  });

  it("does not flag a move below the threshold", () => {
    const points = [point(1, 1_000_000n), point(2, 1_010_000n)]; // +1%
    expect(detectJumps(points, 500)).toEqual([]);
  });

  it("flags a downward move the same as an upward one", () => {
    const points = [point(1, 1_000_000n), point(2, 900_000n)]; // -10%
    const jumps = detectJumps(points, 500);
    expect(jumps[0].changeBps).toBe(1_000);
  });

  it("skips points with no price rather than treating a gap as a 100% move", () => {
    const points = [point(1, 1_000_000n), point(2, null), point(3, 1_050_000n)];
    const jumps = detectJumps(points, 500);
    expect(jumps).toEqual([{ fromBlock: 1, toBlock: 3, changeBps: 500 }]);
  });

  it("returns no jumps for a flat price series", () => {
    const points = [point(1, 1_000_000n), point(2, 1_000_000n), point(3, 1_000_000n)];
    expect(detectJumps(points)).toEqual([]);
  });
});
