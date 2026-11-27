import { describe, expect, it } from "vitest";
import { uncollectedFees } from "@/server/research/clmm-positions/uncollectedFees";
import { closedFixture, inRangeFixture } from "./fixtures";

describe("uncollectedFees", () => {
  it("matches the in-range fixture fee expectations", () => {
    const p = inRangeFixture.position!;
    const pool = inRangeFixture.pool!;
    const fees = uncollectedFees({
      tickCurrent: pool.tick,
      tickLower: p.tickLower,
      tickUpper: p.tickUpper,
      liquidity: BigInt(p.liquidity),
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
      feeGrowthInside0LastX128: BigInt(p.feeGrowthInside0LastX128),
      feeGrowthInside1LastX128: BigInt(p.feeGrowthInside1LastX128),
      tokensOwed0: BigInt(p.tokensOwed0),
      tokensOwed1: BigInt(p.tokensOwed1),
    });
    expect(fees.token0.toString()).toBe(inRangeFixture.expected.fees0Raw);
    expect(fees.token1.toString()).toBe(inRangeFixture.expected.fees1Raw);
  });

  it("returns only tokensOwed for closed positions", () => {
    const p = closedFixture.position!;
    const pool = closedFixture.pool!;
    const fees = uncollectedFees({
      tickCurrent: pool.tick,
      tickLower: p.tickLower,
      tickUpper: p.tickUpper,
      liquidity: 0n,
      feeGrowthGlobal0X128: 0n,
      feeGrowthGlobal1X128: 0n,
      tickLowerData: { feeGrowthOutside0X128: 0n, feeGrowthOutside1X128: 0n },
      tickUpperData: { feeGrowthOutside0X128: 0n, feeGrowthOutside1X128: 0n },
      feeGrowthInside0LastX128: 0n,
      feeGrowthInside1LastX128: 0n,
      tokensOwed0: BigInt(p.tokensOwed0),
      tokensOwed1: BigInt(p.tokensOwed1),
    });
    expect(fees.token0.toString()).toBe(closedFixture.expected.fees0Raw);
    expect(fees.token1.toString()).toBe(closedFixture.expected.fees1Raw);
  });
});
