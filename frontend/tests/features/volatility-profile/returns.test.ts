import { describe, expect, it } from "vitest";
import { computeLogReturns } from "@/server/research/volatility-profile";
import gappy from "./data/gappy-series.json";

describe("computeLogReturns", () => {
  it("excludes steps that cross a detected gap instead of interpolating", () => {
    const steps = computeLogReturns(gappy.observations, gappy.expectedStepSeconds);
    expect(steps).toHaveLength(2);
    expect(steps[0]!.fromTimestamp).toBe(86400);
    expect(steps[1]!.fromTimestamp).toBe(86400 * 6);
  });
});
