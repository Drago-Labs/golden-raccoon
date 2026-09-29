/**
 * Public entry point for the peg deviation workspace.
 *
 * `analysePegObservations` is pure and stateless. The clock is injected through
 * the request window rather than read from the environment, so a fixture
 * produces the same report on any machine at any time.
 */
import { buildAssetCoverage, buildReportCoverage } from "./coverage";
import { findEpisodes, worstDeviation } from "./episodes";
import { assertWithinBounds, assetIdentity, indexDefinitions } from "./pegDefinitions";
import { normalizeObservations } from "./observations";
import { buildRateIndex } from "./referenceRates";
import { findGaps } from "./windows";
import {
  PEG_SCHEMA_VERSION,
  PegError,
  pegRequestSchema,
  type AssetAnalysis,
  type PegReport,
} from "./schema";

export function analysePegObservations(input: unknown): PegReport {
  const parsed = pegRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new PegError("invalid_request", "The peg analysis request could not be read.", parsed.error.flatten());
  }

  const request = parsed.data;
  const windowStartMs = Date.parse(request.windowStart);
  const windowEndMs = Date.parse(request.windowEnd);

  if (!(windowEndMs > windowStartMs)) {
    throw new PegError("invalid_window", "The observation window must end after it starts.");
  }

  try {
    assertWithinBounds(request.series.length);
  } catch (error) {
    throw new PegError("bounds_exceeded", error instanceof Error ? error.message : "Request exceeded a bound.");
  }

  const definitions = indexDefinitions(request.definitions);
  const rates = buildRateIndex(request.referenceRates, request.rateToleranceSeconds);

  const assets: AssetAnalysis[] = [];
  const undefinedAssets: PegReport["undefinedAssets"] = [];

  for (const series of request.series) {
    const identity = assetIdentity(series.asset);
    const definition = definitions.get(identity.identityKey);

    if (!definition) {
      undefinedAssets.push({
        identityKey: identity.identityKey,
        symbol: identity.symbol,
        reason:
          "No peg was declared for this asset. It is not analysed against an assumed one-unit target — a stable-sounding symbol is not a declaration.",
      });
      continue;
    }

    let normalized;

    try {
      normalized = normalizeObservations(series.observations, definition, rates, {
        windowStartMs,
        windowEndMs,
        staleAfterSeconds: request.staleAfterSeconds,
      });
    } catch (error) {
      throw new PegError("invalid_observation", error instanceof Error ? error.message : "An observation could not be read.");
    }

    const gaps = findGaps(normalized.points, request.maxGapSeconds);

    assets.push({
      definition,
      observations: normalized.points,
      gaps,
      episodes: findEpisodes(normalized.points, gaps, request.thresholdBps),
      coverage: buildAssetCoverage(normalized.points, gaps, normalized.duplicateTimestampCount, {
        maxGapSeconds: request.maxGapSeconds,
        windowStartMs,
        windowEndMs,
      }),
      worstDeviationBps: worstDeviation(normalized.points),
    });
  }

  return {
    schemaVersion: PEG_SCHEMA_VERSION,
    windowStart: new Date(windowStartMs).toISOString(),
    windowEnd: new Date(windowEndMs).toISOString(),
    thresholdBps: request.thresholdBps,
    assets,
    undefinedAssets,
    coverage: buildReportCoverage(assets, undefinedAssets.length),
  };
}

export { PegError } from "./schema";
export type { PegReport } from "./schema";
