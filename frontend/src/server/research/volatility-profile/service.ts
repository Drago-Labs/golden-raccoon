import { isValidAssetSymbol, normalizeAssetSymbol } from "./assetIdentity";
import { compareProfiles } from "./comparison";
import { computeDrawdownSummary } from "./drawdown";
import { VolatilityProfileError } from "./errors";
import { detectSeriesGaps } from "./gapDetection";
import { createDefaultPriceSource, type PriceSeriesSource } from "./priceSource";
import { computeLogReturns } from "./returns";
import { volatilityProfileRequestSchema, type VolatilityProfileResult } from "./schema";
import { normalizeObservations } from "./series";
import { computeVolatilityMetrics } from "./volatility";

export async function profileAssetVolatility(
  rawInput: unknown,
  deps: { source?: PriceSeriesSource } = {},
): Promise<VolatilityProfileResult> {
  const parsed = volatilityProfileRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new VolatilityProfileError("Invalid volatility profile request", "invalid_request", false);
  }
  const input = parsed.data;
  if (!isValidAssetSymbol(input.assetSymbol)) {
    throw new VolatilityProfileError(`Unsupported asset symbol: ${input.assetSymbol}`, "unsupported_asset", false);
  }
  if (input.compareInterval && input.compareInterval !== input.interval) {
    throw new VolatilityProfileError("Comparison interval must match primary interval", "mismatched_interval", false);
  }

  const assetSymbol = normalizeAssetSymbol(input.assetSymbol);
  const source = deps.source ?? createDefaultPriceSource();

  let primarySeries;
  try {
    primarySeries = await source.loadSeries({
      assetSymbol,
      interval: input.interval,
      windowDays: input.windowDays,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Price source unavailable";
    return {
      network: input.network,
      assetSymbol,
      interval: input.interval,
      windowDays: input.windowDays,
      state: "unavailable",
      volatility: { sampleSize: 0, periodVolatility: null, annualisedVolatility: null, annualisationFactor: 365 },
      drawdown: {
        maxDrawdownPct: 0,
        peakTimestamp: null,
        troughTimestamp: null,
        recoveryTimestamp: null,
        drawdownDurationSeconds: 0,
        recoveryDurationSeconds: null,
        series: [],
      },
      gaps: [],
      comparison: null,
      coverage: {
        reachedProvider: false,
        source: "unavailable",
        interval: input.interval,
        observationsRead: 0,
        validReturnSteps: 0,
        gapsDetected: 0,
        outliersDetected: 0,
      },
      warnings: [msg],
    };
  }

  const cleanObs = normalizeObservations(primarySeries.observations);
  const gaps = detectSeriesGaps(cleanObs, primarySeries.expectedStepSeconds);
  const returnSteps = computeLogReturns(cleanObs, primarySeries.expectedStepSeconds);
  const volatility = computeVolatilityMetrics(returnSteps, primarySeries.interval);
  const drawdown = computeDrawdownSummary(cleanObs);
  const outliers = returnSteps.filter((s) => s.outlier).length;

  let comparison = null;
  if (input.compareAssetSymbol) {
    const compareSym = normalizeAssetSymbol(input.compareAssetSymbol);
    const compareInterval = input.compareInterval ?? input.interval;
    const compareSeries = await source.loadSeries({
      assetSymbol: compareSym,
      interval: compareInterval,
      windowDays: input.windowDays,
    });
    const compareObs = normalizeObservations(compareSeries.observations);
    const compareSteps = computeLogReturns(compareObs, compareSeries.expectedStepSeconds);
    const compareVol = computeVolatilityMetrics(compareSteps, compareSeries.interval);
    const compareDd = computeDrawdownSummary(compareObs);

    comparison = compareProfiles({
      primaryAsset: assetSymbol,
      primaryInterval: primarySeries.interval,
      primaryVolatility: volatility,
      primaryDrawdown: drawdown,
      compareAsset: compareSym,
      compareInterval: compareSeries.interval,
      compareVolatility: compareVol,
      compareDrawdown: compareDd,
    });
  }

  const warnings: string[] = [];
  if (gaps.length > 0) {
    warnings.push(`${gaps.length} data gap(s) detected and excluded from log-return calculations.`);
  }
  if (outliers > 0) {
    warnings.push(`${outliers} extreme return observation(s) flagged.`);
  }

  const state = gaps.length > 0 || volatility.annualisedVolatility === null ? "partial" : "complete";

  return {
    network: input.network,
    assetSymbol,
    interval: primarySeries.interval,
    windowDays: input.windowDays,
    state,
    volatility,
    drawdown,
    gaps,
    comparison,
    coverage: {
      reachedProvider: true,
      source: primarySeries.source,
      interval: primarySeries.interval,
      observationsRead: cleanObs.length,
      validReturnSteps: returnSteps.length,
      gapsDetected: gaps.length,
      outliersDetected: outliers,
    },
    warnings,
  };
}
