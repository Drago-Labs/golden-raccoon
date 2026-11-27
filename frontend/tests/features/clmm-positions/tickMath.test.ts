import { describe, expect, it } from "vitest";
import { getSqrtRatioAtTick, percentDistance, priceFromTick, Q96 } from "@/server/research/clmm-positions/tickMath";

describe("tickMath", () => {
  it("returns Q96 at tick 0", () => {
    expect(getSqrtRatioAtTick(0)).toBe(Q96);
    expect(priceFromTick(0)).toBe("1");
  });

  it("is monotonic around zero", () => {
    expect(getSqrtRatioAtTick(-60) < getSqrtRatioAtTick(0)).toBe(true);
    expect(getSqrtRatioAtTick(0) < getSqrtRatioAtTick(60)).toBe(true);
  });

  it("formats signed percent distances", () => {
    expect(percentDistance("1", "1.006")).toBe("0.60");
    expect(percentDistance("1", "0.994")).toBe("-0.60");
  });
});
