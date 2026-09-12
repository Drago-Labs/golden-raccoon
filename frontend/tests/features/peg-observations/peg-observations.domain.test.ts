import { describe, expect, it } from "vitest";
import {
  analyzePegObservations,
  calculateDeviationBps,
  calculateObservationWindow,
  calculatePegDeviations,
  detectDeviationEpisodes,
  evaluateObservationCoverage,
  getCanonicalPegDefinition,
  ingestAndSanitizeObservations,
  normalizeObservationCurrencies,
  resolvePegDefinition,
} from "@/server/research/peg-observations";
import {
  CUSTOM_PEG_DEFINITION,
  EURC_ETH_ID,
  JPYC_ETH_ID,
  UNKNOWN_ASSET_ID,
  USDC_BASE_ID,
  USDC_ETH_ID,
  USDC_STELLAR_ALT_ID,
  USDC_STELLAR_NATIVE_ID,
  createOutOfOrderWithDuplicates,
  createRecoveredBreachObservations,
  createSampleReferenceRates,
} from "./fixtures";

describe("Peg Definitions and Identity Isolation", () => {
  it("resolves canonical USDC across distinct chains and issuers with isolated identities", () => {
    const ethDef = resolvePegDefinition(USDC_ETH_ID);
    const baseDef = resolvePegDefinition(USDC_BASE_ID);
    const stellarCentreDef = resolvePegDefinition(USDC_STELLAR_NATIVE_ID);
    const stellarAltDef = resolvePegDefinition(USDC_STELLAR_ALT_ID);

    expect(ethDef).toBeDefined();
    expect(baseDef).toBeDefined();
    expect(stellarCentreDef).toBeDefined();
    expect(stellarAltDef).toBeDefined();

    expect(ethDef?.assetId.network).toBe("ethereum");
    expect(baseDef?.assetId.network).toBe("base");
    expect(stellarCentreDef?.assetId.addressOrIssuer).not.toBe(stellarAltDef?.assetId.addressOrIssuer);
  });

  it("supports non-USD and non-unit 1.0 peg targets like JPYC 100 JPY and EURC 1 EUR", () => {
    const jpycDef = resolvePegDefinition(JPYC_ETH_ID);
    const eurcDef = resolvePegDefinition(EURC_ETH_ID);

    expect(jpycDef?.referenceCurrency).toBe("JPY");
    expect(jpycDef?.declaredTargetValue).toBe(100.0);

    expect(eurcDef?.referenceCurrency).toBe("EUR");
    expect(eurcDef?.declaredTargetValue).toBe(1.0);
  });

  it("returns undefined for unknown assets without explicit peg declaration and throws if resolved without declaration", () => {
    const unknownDef = getCanonicalPegDefinition(UNKNOWN_ASSET_ID);
    expect(unknownDef).toBeUndefined();
    expect(() => resolvePegDefinition(UNKNOWN_ASSET_ID)).toThrow("Explicit peg definition required for unknown asset");
  });

  it("accepts user-declared custom peg definitions for unlisted assets", () => {
    const customDef = resolvePegDefinition(UNKNOWN_ASSET_ID, CUSTOM_PEG_DEFINITION);
    expect(customDef).toBeDefined();
    expect(customDef?.declaredTargetValue).toBe(1.0);
    expect(customDef?.referenceCurrency).toBe("USD");
  });
});

describe("Deterministic Observation Ingestion and Sorting", () => {
  it("sorts out-of-order observations chronologically", () => {
    const baseTime = 1_700_000_000_000;
    const raw = createOutOfOrderWithDuplicates(baseTime);
    const result = ingestAndSanitizeObservations(raw, { now: () => baseTime + 1_000_000 });

    expect(result.observations.length).toBe(4);
    for (let i = 1; i < result.observations.length; i++) {
      expect(result.observations[i].timestamp).toBeGreaterThan(result.observations[i - 1].timestamp);
    }
    expect(result.outOfOrderObservationsSorted).toBeGreaterThan(0);
  });

  it("resolves duplicate millisecond timestamps via arithmetic mean with tracking", () => {
    const baseTime = 1_700_000_000_000;
    const raw = createOutOfOrderWithDuplicates(baseTime);
    const result = ingestAndSanitizeObservations(raw, { now: () => baseTime + 1_000_000 });

    const pointAt60s = result.observations.find((obs) => obs.timestamp === baseTime + 60_000);
    expect(pointAt60s).toBeDefined();
    expect(pointAt60s?.price).toBe(1.003);
    expect(result.duplicateTimestampsResolved).toBe(1);
  });
});

describe("Bounded Windows and Continuity Gaps", () => {
  it("calculates window bounds from observations", () => {
    const baseTime = 1_700_000_000_000;
    const observations = [
      { timestamp: baseTime, price: 1.0, currency: "USD", source: "s1" },
      { timestamp: baseTime + 300_000, price: 1.0, currency: "USD", source: "s2" },
    ];

    const result = calculateObservationWindow(observations);
    expect(result.window.startTime).toBe(baseTime);
    expect(result.window.endTime).toBe(baseTime + 300_000);
    expect(result.window.count).toBe(2);
  });

  it("identifies unobserved intervals exceeding continuity tolerance", () => {
    const baseTime = 1_700_000_000_000;
    const observations = [
      { timestamp: baseTime, price: 1.0, currency: "USD", source: "s1" },
      { timestamp: baseTime + 60_000, price: 1.0, currency: "USD", source: "s2" },
      { timestamp: baseTime + 7_260_000, price: 1.0, currency: "USD", source: "s3" },
    ];

    const result = calculateObservationWindow(observations, { gapToleranceMs: 3_600_000 });
    expect(result.gaps.length).toBe(1);
    expect(result.gaps[0].durationMs).toBe(7_200_000);
    expect(result.gaps[0].startTime).toBe(baseTime + 60_000);
    expect(result.gaps[0].endTime).toBe(baseTime + 7_260_000);
  });
});

describe("Reference Currency Conversion and Missing Rates", () => {
  it("normalizes directly when observation currency matches reference currency", () => {
    const baseTime = 1_700_000_000_000;
    const observations = [{ timestamp: baseTime, price: 1.02, currency: "USD", source: "feed" }];

    const result = normalizeObservationCurrencies(observations, [], "USD");
    expect(result.normalizedObservations[0].normalizedPrice).toBe(1.02);
    expect(result.normalizedObservations[0].referenceCurrency).toBe("USD");
    expect(result.missingRateTimestamps.length).toBe(0);
  });

  it("converts observation currency using reference rates without generating synthetic prices", () => {
    const baseTime = 1_700_000_000_000;
    const observations = [{ timestamp: baseTime, price: 1.0, currency: "EUR", source: "feed" }];
    const rates = createSampleReferenceRates(baseTime);

    const result = normalizeObservationCurrencies(observations, rates, "USD");
    expect(result.normalizedObservations[0].normalizedPrice).toBe(1.085);
    expect(result.normalizedObservations[0].referenceCurrency).toBe("USD");
  });

  it("marks normalizedPrice as null and tracks timestamp when conversion rate is missing", () => {
    const baseTime = 1_700_000_000_000;
    const observations = [{ timestamp: baseTime, price: 1.0, currency: "CAD", source: "feed" }];

    const result = normalizeObservationCurrencies(observations, [], "USD");
    expect(result.normalizedObservations[0].normalizedPrice).toBeNull();
    expect(result.missingRateTimestamps).toContain(baseTime);
  });
});

describe("Deviation Calculation and Summary Metrics", () => {
  it("calculates accurate basis points deviation for unit 1.0 peg targets", () => {
    expect(calculateDeviationBps(0.995, 1.0)).toBe(-50);
    expect(calculateDeviationBps(1.005, 1.0)).toBe(50);
    expect(calculateDeviationBps(1.0, 1.0)).toBe(0);
  });

  it("calculates accurate basis points deviation for non-unit 100.0 peg targets", () => {
    expect(calculateDeviationBps(99.0, 100.0)).toBe(-100);
    expect(calculateDeviationBps(101.5, 100.0)).toBe(150);
    expect(calculateDeviationBps(100.0, 100.0)).toBe(0);
  });

  it("computes distribution metrics and threshold breach counts", () => {
    const baseTime = 1_700_000_000_000;
    const observations = createRecoveredBreachObservations(baseTime);
    const ethDef = resolvePegDefinition(USDC_ETH_ID);
    expect(ethDef).toBeDefined();

    const { summary } = calculatePegDeviations(observations, ethDef!);

    expect(summary.minDeviationBps).toBe(-100);
    expect(summary.maxDeviationBps).toBe(0);
  });
});

describe("Deviation Episodes and Gap Interruption Rules", () => {
  it("tracks recovered deviation episodes when price returns strictly within threshold", () => {
    const baseTime = 1_700_000_000_000;
    const observations = createRecoveredBreachObservations(baseTime);
    const result = detectDeviationEpisodes(observations, 50, { gapToleranceMs: 3_600_000 });

    expect(result.episodes.length).toBe(1);
    expect(result.episodes[0].status).toBe("recovered");
    expect(result.episodes[0].peakDeviationBps).toBe(-100);
    expect(result.episodes[0].durationMs).toBe(120_000);
  });

  it("marks episodes as interrupted by gap when spanning unobserved intervals", () => {
    const baseTime = 1_700_000_000_000;
    const observations = [
      { timestamp: baseTime, rawPrice: 1.0, rawCurrency: "USD", normalizedPrice: 1.0, referenceCurrency: "USD", deviationBps: 0, isStale: false, isRateMissing: false, source: "feed" },
      { timestamp: baseTime + 60_000, rawPrice: 0.99, rawCurrency: "USD", normalizedPrice: 0.99, referenceCurrency: "USD", deviationBps: -100, isStale: false, isRateMissing: false, source: "feed" },
      { timestamp: baseTime + 7_260_000, rawPrice: 1.0, rawCurrency: "USD", normalizedPrice: 1.0, referenceCurrency: "USD", deviationBps: 0, isStale: false, isRateMissing: false, source: "feed" },
    ];

    const result = detectDeviationEpisodes(observations, 50, { gapToleranceMs: 3_600_000 });
    expect(result.episodes.length).toBe(1);
    expect(result.episodes[0].status).toBe("interrupted_by_gap");
  });
});

describe("Coverage Evaluation and Sourcing Limits", () => {
  it("evaluates coverage status and generates explicit sourcing limits notice", () => {
    const baseTime = 1_700_000_000_000;
    const window = {
      startTime: baseTime,
      endTime: baseTime + 300_000,
      count: 5,
      minIntervalMs: 60_000,
      maxIntervalMs: 60_000,
      averageIntervalMs: 60_000,
      gapCount: 0,
      maxGapDurationMs: 0,
    };

    const coverage = evaluateObservationCoverage({
      totalObservations: 5,
      validObservations: 5,
      duplicateTimestampsResolved: 0,
      outOfOrderObservationsSorted: 0,
      gaps: [],
      missingRateTimestamps: [],
      stalePointCount: 0,
      window,
    });

    expect(coverage.status).toBe("complete");
    expect(coverage.coveragePercentage).toBe(100);
    expect(coverage.sourcingLimits).toContain("Observations derived from verified evidence feeds");
  });
});

describe("Stateless Analysis Pipeline Orchestration", () => {
  it("executes complete analysis using benchmark fixture", () => {
    const result = analyzePegObservations({
      assetId: USDC_ETH_ID,
      thresholdBps: 50,
      gapToleranceMs: 3_600_000,
      fixture: "usd-and-nonusd-targets",
    });

    expect(result.pegDefinition.assetId.symbol).toBe("EURC");
    expect(result.pegDefinition.declaredTargetValue).toBe(1.0);
    expect(result.coverage.status).toBe("complete");
    expect(result.episodes.length).toBeGreaterThan(0);
  });

  it("handles gap recovery benchmark fixture", () => {
    const result = analyzePegObservations({
      assetId: USDC_ETH_ID,
      thresholdBps: 50,
      gapToleranceMs: 3_600_000,
      fixture: "deviation-recovery-with-gaps",
    });

    expect(result.coverage.gapsDetected.length).toBeGreaterThan(0);
    expect(result.coverage.status).toBe("gap_interrupted");
    expect(result.episodes.some((e) => e.status === "interrupted_by_gap")).toBe(true);
  });
});
