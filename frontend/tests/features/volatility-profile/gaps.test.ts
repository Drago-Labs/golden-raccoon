import { describe, expect, it } from "vitest";
import { compareProfiles, detectSeriesGaps } from "@/server/research/volatility-profile";
import gappy from "./data/gappy-series.json";

describe("detectSeriesGaps and compareProfiles", () => {
  it("lists gaps exceeding the expected step threshold", () => {
    const gaps = detectSeriesGaps(gappy.observations, gappy.expectedStepSeconds);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.fromTimestamp).toBe(86400 * 2);
    expect(gaps[0]!.toTimestamp).toBe(86400 * 6);
  });

  it("refuses comparisons when intervals do not match", () => {
    expect(() =>
      compareProfiles({
        primaryAsset: "XLM",
        primaryInterval: "1d",
        primaryVolatility: { sampleSize: 3, periodVolatility: 0.01, annualisedVolatility: 0.19, annualisationFactor: 365 },
        primaryDrawdown: { maxDrawdownPct: 10, peakTimestamp: 1, troughTimestamp: 2, recoveryTimestamp: 3, drawdownDurationSeconds: 1, recoveryDurationSeconds: 1, series: [] },
        compareAsset: "BTC",
        compareInterval: "1h",
        compareVolatility: { sampleSize: 3, periodVolatility: 0.01, annualisedVolatility: 0.19, annualisationFactor: 8760 },
        compareDrawdown: { maxDrawdownPct: 5, peakTimestamp: 1, troughTimestamp: 2, recoveryTimestamp: 3, drawdownDurationSeconds: 1, recoveryDurationSeconds: 1, series: [] },
      }),
    ).toThrow(/mismatched intervals/i);
  });
});
