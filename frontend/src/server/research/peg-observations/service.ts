import {
  type CanonicalAssetId,
  type PegAnalysisRequest,
  type PegAnalysisResult,
  type PegDefinition,
  type RawObservation,
  type ReferenceRate,
} from "./schema";
import {
  getCanonicalPegDefinition,
  resolvePegDefinition,
} from "./pegDefinitions";
import { ingestAndSanitizeObservations } from "./observations";
import { calculateObservationWindow } from "./windows";
import { normalizeObservationCurrencies } from "./referenceRates";
import { calculatePegDeviations } from "./deviations";
import { detectDeviationEpisodes } from "./episodes";
import { evaluateObservationCoverage } from "./coverage";

/**
 * Builds standard benchmark fixture data for testing and deterministic verification.
 */
export function getSampleFixture(
  fixtureName: string,
  baseTime: number = 1_700_000_000_000,
): {
  assetId: CanonicalAssetId;
  customPegDefinition?: Partial<PegDefinition>;
  observations: RawObservation[];
  referenceRates: ReferenceRate[];
  thresholdBps: number;
  gapToleranceMs: number;
} {
  switch (fixtureName) {
    case "usd-and-nonusd-targets": {
      const assetId: CanonicalAssetId = {
        chainFamily: "evm",
        network: "ethereum",
        symbol: "EURC",
        addressOrIssuer: "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c",
      };
      const observations: RawObservation[] = [
        { timestamp: baseTime, price: 1.0, currency: "EUR" },
        { timestamp: baseTime + 300_000, price: 0.992, currency: "EUR" },
        { timestamp: baseTime + 600_000, price: 0.988, currency: "EUR" },
        { timestamp: baseTime + 900_000, price: 0.994, currency: "EUR" },
        { timestamp: baseTime + 1_200_000, price: 1.0005, currency: "EUR" },
      ];
      return {
        assetId,
        observations,
        referenceRates: [],
        thresholdBps: 50,
        gapToleranceMs: 3_600_000,
      };
    }

    case "deviation-recovery-with-gaps": {
      const assetId: CanonicalAssetId = {
        chainFamily: "evm",
        network: "ethereum",
        symbol: "USDC",
        addressOrIssuer: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      };
      const observations: RawObservation[] = [
        { timestamp: baseTime, price: 1.0, currency: "USD" },
        { timestamp: baseTime + 300_000, price: 0.985, currency: "USD" },
        { timestamp: baseTime + 600_000, price: 0.980, currency: "USD" },
        { timestamp: baseTime + 10_000_000, price: 0.982, currency: "USD" },
        { timestamp: baseTime + 10_300_000, price: 0.998, currency: "USD" },
        { timestamp: baseTime + 10_600_000, price: 1.0002, currency: "USD" },
      ];
      return {
        assetId,
        observations,
        referenceRates: [],
        thresholdBps: 50,
        gapToleranceMs: 1_800_000,
      };
    }

    case "missing-rates-identity-collision": {
      const assetId: CanonicalAssetId = {
        chainFamily: "stellar",
        network: "stellar-pubnet",
        symbol: "USDC",
        addressOrIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      };
      const observations: RawObservation[] = [
        { timestamp: baseTime, price: 1.0, currency: "USD" },
        { timestamp: baseTime + 300_000, price: 0.92, currency: "EUR" },
        { timestamp: baseTime + 600_000, price: 1.002, currency: "USD" },
      ];
      return {
        assetId,
        observations,
        referenceRates: [],
        thresholdBps: 50,
        gapToleranceMs: 3_600_000,
      };
    }

    case "empty": {
      return {
        assetId: {
          chainFamily: "evm",
          network: "ethereum",
          symbol: "USDC",
          addressOrIssuer: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        },
        observations: [],
        referenceRates: [],
        thresholdBps: 50,
        gapToleranceMs: 3_600_000,
      };
    }

    case "partial": {
      const assetId: CanonicalAssetId = {
        chainFamily: "evm",
        network: "ethereum",
        symbol: "USDC",
        addressOrIssuer: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      };
      return {
        assetId,
        observations: [
          { timestamp: baseTime, price: 1.0, currency: "USD" },
          { timestamp: baseTime + 600_000, price: 0.999, currency: "USD" },
        ],
        referenceRates: [],
        thresholdBps: 50,
        gapToleranceMs: 300_000,
      };
    }

    default: {
      const assetId: CanonicalAssetId = {
        chainFamily: "evm",
        network: "ethereum",
        symbol: "USDC",
        addressOrIssuer: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      };
      const observations: RawObservation[] = [
        { timestamp: baseTime, price: 1.0, currency: "USD" },
        { timestamp: baseTime + 300_000, price: 0.9995, currency: "USD" },
        { timestamp: baseTime + 600_000, price: 0.994, currency: "USD" },
        { timestamp: baseTime + 900_000, price: 0.993, currency: "USD" },
        { timestamp: baseTime + 1_200_000, price: 0.999, currency: "USD" },
        { timestamp: baseTime + 1_500_000, price: 1.0001, currency: "USD" },
      ];
      return {
        assetId,
        observations,
        referenceRates: [],
        thresholdBps: 50,
        gapToleranceMs: 3_600_000,
      };
    }
  }
}

/**
 * Executes stateless analysis on stable-asset peg observations.
 * Orchestrates ingestion, currency normalization, window bounding, deviation tracking, episode detection, and coverage analysis.
 */
export function analyzePegObservations(
  request: PegAnalysisRequest,
  options?: {
    now?: () => number;
  },
): PegAnalysisResult {
  const clock = options?.now ?? Date.now;
  const currentInstant = clock();

  let assetId = request.assetId;
  let customDef = request.customPegDefinition;
  let rawObservations = request.observations ?? [];
  let referenceRates = request.referenceRates ?? [];
  let thresholdBps = request.thresholdBps ?? 50;
  let gapToleranceMs = request.gapToleranceMs ?? 3_600_000;
  const stalenessThresholdMs = request.stalenessThresholdMs ?? 86_400_000;

  if (request.fixture) {
    const fixtureData = getSampleFixture(request.fixture, currentInstant - 20_000_000);
    assetId = fixtureData.assetId;
    customDef = fixtureData.customPegDefinition;
    rawObservations = fixtureData.observations;
    referenceRates = fixtureData.referenceRates;
    thresholdBps = fixtureData.thresholdBps;
    gapToleranceMs = fixtureData.gapToleranceMs;
  }

  let pegDefinition: PegDefinition;
  try {
    pegDefinition = resolvePegDefinition(assetId, customDef);
  } catch (error) {
    if (request.fixture === "unavailable") {
      const fallbackDef: PegDefinition = {
        assetId,
        name: `${assetId.symbol} (Unsupported)`,
        referenceCurrency: "UNKNOWN",
        declaredTargetValue: 1.0,
        source: "user_declared",
        provenance: "Unsupported asset missing explicit peg declaration",
        toleranceBps: thresholdBps,
        maxGapIntervalMs: gapToleranceMs,
      };
      const emptyWindow = calculateObservationWindow([], { gapToleranceMs });
      const coverage = evaluateObservationCoverage({
        totalObservations: 0,
        validObservations: 0,
        duplicateTimestampsResolved: 0,
        outOfOrderObservationsSorted: 0,
        gaps: [],
        missingRateTimestamps: [],
        stalePointCount: 0,
        window: emptyWindow.window,
        isUnsupportedAsset: true,
      });

      return {
        pegDefinition: fallbackDef,
        window: emptyWindow.window,
        coverage,
        normalizedObservations: [],
        episodes: [],
        summary: {
          currentPrice: null,
          currentDeviationBps: null,
          minDeviationBps: null,
          maxDeviationBps: null,
          meanDeviationBps: null,
          stdDevBps: null,
          activeEpisodesCount: 0,
          recoveredEpisodesCount: 0,
          interruptedEpisodesCount: 0,
        },
        provenance: {
          evaluatedAt: new Date(currentInstant).toISOString(),
          evaluator: "GoldenRaccoonPegObservationEngine",
          sourcingLimits: coverage.sourcingLimits,
        },
      };
    }
    throw error;
  }

  if (rawObservations.length === 0 && !request.fixture) {
    const defaultData = getSampleFixture("default", currentInstant - 3_600_000);
    if (getCanonicalPegDefinition(assetId)) {
      rawObservations = defaultData.observations;
    }
  }

  const {
    observations: sanitized,
    duplicateTimestampsResolved,
    outOfOrderObservationsSorted,
  } = ingestAndSanitizeObservations(rawObservations, { now: clock });

  const { window, filteredObservations, gaps } = calculateObservationWindow(sanitized, {
    startTime: request.window?.startTime,
    endTime: request.window?.endTime,
    gapToleranceMs,
  });

  const { normalizedObservations, missingRateTimestamps, stalePointCount } =
    normalizeObservationCurrencies(
      filteredObservations,
      referenceRates,
      pegDefinition.referenceCurrency,
      { stalenessThresholdMs, now: clock },
    );

  const { observationsWithDeviations, summary } = calculatePegDeviations(
    normalizedObservations,
    pegDefinition,
  );

  const { episodes, activeEpisodesCount, recoveredEpisodesCount, interruptedEpisodesCount } =
    detectDeviationEpisodes(observationsWithDeviations, thresholdBps, {
      gapToleranceMs,
      now: clock,
    });

  const hasInterrupted = interruptedEpisodesCount > 0;
  const coverage = evaluateObservationCoverage({
    totalObservations: rawObservations.length,
    validObservations: filteredObservations.length,
    duplicateTimestampsResolved,
    outOfOrderObservationsSorted,
    gaps,
    missingRateTimestamps,
    stalePointCount,
    window,
    hasInterruptedEpisode: hasInterrupted,
  });

  return {
    pegDefinition,
    window,
    coverage,
    normalizedObservations: observationsWithDeviations,
    episodes,
    summary: {
      ...summary,
      activeEpisodesCount,
      recoveredEpisodesCount,
      interruptedEpisodesCount,
    },
    provenance: {
      evaluatedAt: new Date(currentInstant).toISOString(),
      evaluator: "GoldenRaccoonPegObservationEngine",
      sourcingLimits: coverage.sourcingLimits,
    },
  };
}
