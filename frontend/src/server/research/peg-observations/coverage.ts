/**
 * Per-asset and report-level coverage.
 *
 * A series with unconverted points, stale points or gaps is `partial`, and the
 * note says which. A series with no convertible observation at all is
 * `unavailable` — distinct from an asset that was simply never observed.
 */
import { observedWindowFraction } from "./windows";
import type { AssetAnalysis, AssetCoverage, ObservationGap, ObservationPoint } from "./schema";

export function buildAssetCoverage(
  points: ObservationPoint[],
  gaps: ObservationGap[],
  duplicateTimestampCount: number,
  options: { maxGapSeconds: number; windowStartMs: number; windowEndMs: number },
): AssetCoverage {
  const converted = points.filter((point) => point.referencePrice !== null).length;
  const stale = points.filter((point) => point.stale).length;
  const longestGapSeconds = gaps.reduce((longest, gap) => Math.max(longest, gap.gapSeconds), 0);

  const base = {
    observationCount: points.length,
    convertedCount: converted,
    unconvertedCount: points.length - converted,
    staleCount: stale,
    duplicateTimestampCount,
    gapCount: gaps.length,
    longestGapSeconds,
    observedWindowFraction: observedWindowFraction(points, options.maxGapSeconds, options.windowStartMs, options.windowEndMs),
  };

  if (points.length === 0) {
    return {
      ...base,
      state: "unavailable",
      note: "No observation for this asset falls inside the window, so no deviation can be reported.",
    };
  }

  if (converted === 0) {
    return {
      ...base,
      state: "unavailable",
      note: "No observation could be converted into the peg's reference currency, so no deviation is derived. The raw prices are shown in their own currency.",
    };
  }

  const reasons: string[] = [];
  if (base.unconvertedCount > 0) reasons.push(`${base.unconvertedCount} observation${base.unconvertedCount === 1 ? "" : "s"} could not be converted`);
  if (stale > 0) reasons.push(`${stale} observation${stale === 1 ? " is" : "s are"} past the staleness bound`);
  if (gaps.length > 0) reasons.push(`${gaps.length} gap${gaps.length === 1 ? "" : "s"} of up to ${longestGapSeconds} seconds`);
  if (duplicateTimestampCount > 0) reasons.push(`${duplicateTimestampCount} duplicate timestamp${duplicateTimestampCount === 1 ? "" : "s"} were collapsed, last value winning`);

  if (reasons.length === 0) {
    return { ...base, state: "complete", note: "Every observation in the window converted cleanly, with no gap and no stale point." };
  }

  return {
    ...base,
    state: "partial",
    note: `Read this series as partial: ${reasons.join("; ")}. Nothing is asserted about unobserved intervals.`,
  };
}

export function buildReportCoverage(
  assets: AssetAnalysis[],
  undefinedCount: number,
): { state: "complete" | "partial" | "empty"; assetCount: number; analysedAssetCount: number; note: string } {
  const total = assets.length + undefinedCount;

  if (total === 0) {
    return { state: "empty", assetCount: 0, analysedAssetCount: 0, note: "No asset series was supplied, so there is nothing to analyse." };
  }

  const complete = undefinedCount === 0 && assets.every((asset) => asset.coverage.state === "complete");

  return {
    state: complete ? "complete" : "partial",
    assetCount: total,
    analysedAssetCount: assets.length,
    note: complete
      ? "Every asset carried a declared peg and a clean observation series."
      : `${assets.length} of ${total} assets were analysed. ${undefinedCount > 0 ? `${undefinedCount} had no declared peg and were not analysed against an assumed target.` : ""} Some series are partial.`.trim(),
  };
}
