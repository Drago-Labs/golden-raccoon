import { describe, expect, it } from "vitest";
import { PegError } from "@/server/research/peg-observations/schema";
import { analysePegObservations } from "@/server/research/peg-observations/service";
import {
  convertibleSeries,
  deviationRecoveryWithGaps,
  duplicatesAndDisorder,
  emptyRequest,
  exactlyAtThreshold,
  missingRatesIdentityCollision,
  usdAndNonUsdTargets,
} from "./fixtures";

describe("declared targets", () => {
  it("uses a non-USD, non-unit target rather than a hardcoded dollar", () => {
    const report = analysePegObservations(usdAndNonUsdTargets);
    const eurc = report.assets.find((asset) => asset.definition.asset.symbol === "EURC");

    expect(eurc?.definition.referenceCurrency).toBe("EUR");
    expect(eurc?.definition.targetValue).toBe("0.83");
    // 0.8217 against 0.83 is exactly -100 bps, not the -1783 bps a dollar
    // target would have produced.
    expect(eurc?.observations[1].deviationBps).toBe(-100);
  });

  it("computes the USD asset against its own declared target", () => {
    const report = analysePegObservations(usdAndNonUsdTargets);
    const usdc = report.assets.find((asset) => asset.definition.asset.symbol === "USDC");

    expect(usdc?.observations[1].deviationBps).toBe(-50);
  });

  it("says the target came from a declaration, not from the symbol", () => {
    const report = analysePegObservations(usdAndNonUsdTargets);

    expect(report.assets[0].definition.note).toMatch(/not assumed from the asset's symbol/i);
  });

  it("refuses to analyse an asset with no declared peg", () => {
    const report = analysePegObservations(missingRatesIdentityCollision);

    expect(report.undefinedAssets).toHaveLength(1);
    expect(report.undefinedAssets[0].reason).toMatch(/not analysed against an assumed one-unit target/i);
    expect(report.assets).toHaveLength(1);
  });

  it("keeps same-symbol different-issuer assets on separate definitions", () => {
    const report = analysePegObservations(missingRatesIdentityCollision);

    expect(report.assets[0].definition.asset.identityKey).not.toBe(report.undefinedAssets[0].identityKey);
    expect(report.undefinedAssets[0].symbol).toBe("USDC");
  });
});

describe("sparse observations", () => {
  it("records a gap rather than implying continuous deviation", () => {
    const report = analysePegObservations(deviationRecoveryWithGaps);
    const asset = report.assets[0];

    expect(asset.gaps).toHaveLength(1);
    expect(asset.gaps[0].gapSeconds).toBe(18_000);
    expect(asset.gaps[0].note).toMatch(/neither that it held nor that it broke/i);
  });

  it("marks an episode spanning a gap as a lower bound", () => {
    const report = analysePegObservations(deviationRecoveryWithGaps);
    const episode = report.assets[0].episodes[0];

    expect(episode.startedAt).toBe("2026-01-01T01:00:00.000Z");
    expect(episode.recoveredAt).toBe("2026-01-01T08:00:00.000Z");
    expect(episode.containsGap).toBe(true);
    expect(episode.note).toMatch(/lower bound/i);
  });

  it("measures duration between observed boundaries only", () => {
    const report = analysePegObservations(deviationRecoveryWithGaps);
    const episode = report.assets[0].episodes[0];

    // 01:00 to 08:00 is 25 200 seconds, both endpoints observed.
    expect(episode.observedDurationSeconds).toBe(25_200);
  });

  it("reports an unrecovered episode without guaranteeing failure", () => {
    const report = analysePegObservations({
      ...deviationRecoveryWithGaps,
      series: [
        {
          asset: deviationRecoveryWithGaps.series[0].asset,
          observations: deviationRecoveryWithGaps.series[0].observations.slice(0, 3),
        },
      ],
    });
    const episode = report.assets[0].episodes[0];

    expect(episode.recoveredAt).toBeNull();
    expect(episode.observedDurationSeconds).toBeNull();
    expect(episode.note).toMatch(/not known to have failed/i);
  });

  it("reports the fraction of the window actually observed", () => {
    const report = analysePegObservations(deviationRecoveryWithGaps);

    expect(report.assets[0].coverage.observedWindowFraction).toBeLessThan(1);
    expect(report.assets[0].coverage.observedWindowFraction).toBeGreaterThan(0);
  });
});

describe("deterministic boundary rules", () => {
  it("opens an episode at exactly the threshold", () => {
    const report = analysePegObservations(exactlyAtThreshold);

    expect(report.assets[0].observations[0].deviationBps).toBe(-50);
    expect(report.assets[0].episodes).toHaveLength(1);
  });

  it("sorts out-of-order observations by timestamp", () => {
    const report = analysePegObservations(duplicatesAndDisorder);
    const times = report.assets[0].observations.map((point) => point.observedAt);

    expect(times).toEqual([...times].sort());
  });

  it("collapses a duplicate timestamp with last value winning, and counts it", () => {
    const report = analysePegObservations(duplicatesAndDisorder);
    const asset = report.assets[0];

    expect(asset.coverage.duplicateTimestampCount).toBe(1);
    expect(asset.observations).toHaveLength(3);
    expect(asset.observations[1].sourceLabel).toBe("Last value wins");
    expect(asset.observations[1].deviationBps).toBe(-50);
  });

  it("is deterministic across repeated runs", () => {
    expect(analysePegObservations(duplicatesAndDisorder)).toEqual(analysePegObservations(duplicatesAndDisorder));
  });
});

describe("currency conversion", () => {
  it("converts only when a timestamped rate exists", () => {
    const report = analysePegObservations(convertibleSeries);
    const points = report.assets[0].observations;

    expect(points[0].referencePrice).toBe("1.1");
    expect(points[0].deviationBps).toBe(0);
    expect(points[1].deviationBps).toBe(-100);
  });

  it("leaves an observation unconverted when no rate is available", () => {
    const report = analysePegObservations(missingRatesIdentityCollision);
    const unconverted = report.assets[0].observations[1];

    expect(unconverted.referencePrice).toBeNull();
    expect(unconverted.deviationBps).toBeNull();
    expect(unconverted.unavailableReason).toMatch(/no XLM→USD rate/i);
  });

  it("keeps the raw price visible when conversion fails", () => {
    const report = analysePegObservations(missingRatesIdentityCollision);
    const unconverted = report.assets[0].observations[1];

    expect(unconverted.rawPrice).toBe("2.50");
    expect(unconverted.rawCurrency).toBe("XLM");
  });

  it("never lets an unconverted point open or close an episode", () => {
    const report = analysePegObservations(missingRatesIdentityCollision);

    expect(report.assets[0].episodes).toHaveLength(0);
  });

  it("refuses a rate older than the tolerance", () => {
    const report = analysePegObservations({
      ...convertibleSeries,
      referenceRates: [
        // 4 hours before the first observation, against a 1-hour tolerance.
        { from: "EUR", to: "USD", rate: "1.10", observedAt: "2025-12-31T21:00:00.000Z", sourceLabel: "Stale rate" },
      ],
    });

    expect(report.assets[0].observations.every((point) => point.referencePrice === null)).toBe(true);
    expect(report.assets[0].observations[0].unavailableReason).toMatch(/within the 3600-second tolerance/i);
  });

  it("refuses a rate observed after the observation", () => {
    const report = analysePegObservations({
      ...convertibleSeries,
      referenceRates: [
        { from: "EUR", to: "USD", rate: "1.10", observedAt: "2026-01-01T23:00:00.000Z", sourceLabel: "Late rate" },
      ],
    });

    expect(report.assets[0].observations.every((point) => point.referencePrice === null)).toBe(true);
  });
});

describe("coverage states", () => {
  it("distinguishes complete, partial and unavailable series", () => {
    expect(analysePegObservations(usdAndNonUsdTargets).assets[0].coverage.state).toBe("complete");
    expect(analysePegObservations(deviationRecoveryWithGaps).assets[0].coverage.state).toBe("partial");
    expect(analysePegObservations(missingRatesIdentityCollision).assets[0].coverage.state).toBe("partial");
  });

  it("reports a series with nothing convertible as unavailable", () => {
    const report = analysePegObservations({
      ...missingRatesIdentityCollision,
      series: [
        {
          asset: missingRatesIdentityCollision.series[0].asset,
          observations: [missingRatesIdentityCollision.series[0].observations[1]],
        },
      ],
    });

    expect(report.assets[0].coverage.state).toBe("unavailable");
    expect(report.assets[0].coverage.note).toMatch(/no deviation is derived/i);
  });

  it("treats an empty request as a valid result", () => {
    const report = analysePegObservations(emptyRequest);

    expect(report.coverage.state).toBe("empty");
    expect(report.coverage.note).toMatch(/nothing to analyse/i);
  });
});

describe("validation", () => {
  it("rejects a window that does not move forward", () => {
    expect(() =>
      analysePegObservations({ ...emptyRequest, windowStart: "2026-01-02T00:00:00.000Z", windowEnd: "2026-01-01T00:00:00.000Z" }),
    ).toThrow(PegError);
  });

  it("rejects a definition with no provenance", () => {
    expect(() =>
      analysePegObservations({
        ...usdAndNonUsdTargets,
        definitions: [{ asset: { chainId: "ethereum", symbol: "X" }, referenceCurrency: "USD", targetValue: "1.00" }],
      }),
    ).toThrow(PegError);
  });

  it("rejects a non-numeric price", () => {
    expect(() =>
      analysePegObservations({
        ...usdAndNonUsdTargets,
        series: [
          {
            asset: usdAndNonUsdTargets.series[0].asset,
            observations: [{ observedAt: "2026-01-01T00:00:00.000Z", price: "abc", currency: "USD", sourceLabel: "x" }],
          },
        ],
      }),
    ).toThrow(PegError);
  });

  it("does not mutate the supplied request", () => {
    const before = JSON.stringify(usdAndNonUsdTargets);
    analysePegObservations(usdAndNonUsdTargets);
    expect(JSON.stringify(usdAndNonUsdTargets)).toBe(before);
  });
});
