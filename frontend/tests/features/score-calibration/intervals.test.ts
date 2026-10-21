import { describe, expect, it } from "vitest";
import { isSampleSufficient, wilsonInterval } from "@/server/research/score-calibration/intervals";

describe("wilsonInterval", () => {
  it("returns null for a zero sample size", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });

  it("brackets the observed rate for a mid-size sample", () => {
    const interval = wilsonInterval(5, 20);
    expect(interval).not.toBeNull();
    expect(interval!.low).toBeLessThan(0.25);
    expect(interval!.high).toBeGreaterThan(0.25);
    expect(interval!.low).toBeGreaterThanOrEqual(0);
    expect(interval!.high).toBeLessThanOrEqual(1);
  });

  it("widens for a smaller sample at the same observed rate", () => {
    const small = wilsonInterval(1, 4);
    const large = wilsonInterval(25, 100);
    const widthSmall = small!.high - small!.low;
    const widthLarge = large!.high - large!.low;
    expect(widthSmall).toBeGreaterThan(widthLarge);
  });

  it("stays within [0, 1] at the extremes", () => {
    const allSuccess = wilsonInterval(10, 10);
    const allFailure = wilsonInterval(0, 10);
    expect(allSuccess!.high).toBeLessThanOrEqual(1);
    expect(allFailure!.low).toBeGreaterThanOrEqual(0);
  });
});

describe("isSampleSufficient", () => {
  it("flags a bucket below the minimum sample size", () => {
    expect(isSampleSufficient(3)).toBe(false);
  });

  it("accepts a bucket at or above the minimum sample size", () => {
    expect(isSampleSufficient(10)).toBe(true);
    expect(isSampleSufficient(50)).toBe(true);
  });
});
