import { VolatilityProfileError } from "./errors";
import type { DrawdownSummary, SeriesComparison, SeriesInterval, VolatilityMetrics } from "./schema";

export function compareProfiles(input: {
  primaryAsset: string;
  primaryInterval: SeriesInterval;
  primaryVolatility: VolatilityMetrics;
  primaryDrawdown: DrawdownSummary;
  compareAsset: string;
  compareInterval: SeriesInterval;
  compareVolatility: VolatilityMetrics;
  compareDrawdown: DrawdownSummary;
}): SeriesComparison {
  if (input.primaryInterval !== input.compareInterval) {
    throw new VolatilityProfileError(
      `Cannot compare series with mismatched intervals (${input.primaryInterval} vs ${input.compareInterval}).`,
      "mismatched_interval",
      false,
    );
  }

  const volDiff =
    input.primaryVolatility.annualisedVolatility !== null &&
    input.compareVolatility.annualisedVolatility !== null
      ? Number(
          (
            input.primaryVolatility.annualisedVolatility -
            input.compareVolatility.annualisedVolatility
          ).toFixed(6),
        )
      : null;

  return {
    primaryAsset: input.primaryAsset,
    compareAsset: input.compareAsset,
    interval: input.primaryInterval,
    annualisedVolatilityDiff: volDiff,
    maxDrawdownDiffPct: Number(
      (input.primaryDrawdown.maxDrawdownPct - input.compareDrawdown.maxDrawdownPct).toFixed(4),
    ),
  };
}
