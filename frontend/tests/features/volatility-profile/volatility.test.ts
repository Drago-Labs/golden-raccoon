import { describe, expect, it } from "vitest";
import { computeLogReturns, computeVolatilityMetrics } from "@/server/research/volatility-profile";
import steady from "./data/steady-series.json";

describe("computeVolatilityMetrics", () => {
  it("computes period and annualised volatility with the stated annualisation factor", () => {
    const steps = computeLogReturns(steady.observations, steady.expectedStepSeconds);
    const metrics = computeVolatilityMetrics(steps, "1d");
    expect(metrics.sampleSize).toBe(3);
    expect(metrics.annualisationFactor).toBe(365);
    expect(metrics.annualisedVolatility).toBeGreaterThan(0);
  });
});
