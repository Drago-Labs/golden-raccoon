import { describe, expect, it } from "vitest";
import { amountsForPosition, formatTokenAmount } from "@/server/research/clmm-positions/amounts";
import { inRangeFixture, outOfRangeFixture } from "./fixtures";

describe("amounts", () => {
  it("matches the in-range fixture exactly", () => {
    const result = amountsForPosition({
      tickCurrent: inRangeFixture.pool!.tick,
      tickLower: inRangeFixture.position!.tickLower,
      tickUpper: inRangeFixture.position!.tickUpper,
      liquidity: BigInt(inRangeFixture.position!.liquidity),
      sqrtPriceX96: BigInt(inRangeFixture.pool!.sqrtPriceX96),
    });
    expect(result.amount0.toString()).toBe(inRangeFixture.expected.amount0Raw);
    expect(result.amount1.toString()).toBe(inRangeFixture.expected.amount1Raw);
    expect(formatTokenAmount(result.amount0, 18)).toBe(inRangeFixture.expected.amount0);
    expect(formatTokenAmount(result.amount1, 18)).toBe(inRangeFixture.expected.amount1);
  });

  it("matches the out-of-range fixture exactly", () => {
    const result = amountsForPosition({
      tickCurrent: outOfRangeFixture.pool!.tick,
      tickLower: outOfRangeFixture.position!.tickLower,
      tickUpper: outOfRangeFixture.position!.tickUpper,
      liquidity: BigInt(outOfRangeFixture.position!.liquidity),
      sqrtPriceX96: BigInt(outOfRangeFixture.pool!.sqrtPriceX96),
    });
    expect(result.amount0.toString()).toBe(outOfRangeFixture.expected.amount0Raw);
    expect(result.amount1.toString()).toBe(outOfRangeFixture.expected.amount1Raw);
  });

  it("returns zeros for zero liquidity", () => {
    const result = amountsForPosition({
      tickCurrent: 0,
      tickLower: -60,
      tickUpper: 60,
      liquidity: 0n,
    });
    expect(result).toEqual({ amount0: 0n, amount1: 0n });
  });
});
