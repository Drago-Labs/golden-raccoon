import type { CoverageNotice, RoundingSample, SharePricePoint, VaultConformance } from "./schema";

/**
 * Summarizes what this request actually managed to read, independent of
 * whether the overall result is "complete". A conforming vault with every
 * sample and price point available still gets a coverage notice — the
 * UI shows it unconditionally so a reader never has to infer coverage
 * from the absence of a warning.
 */
export function buildCoverage(input: {
  reachedProvider: boolean;
  conformance: VaultConformance;
  roundingSamplesRequested: number;
  roundingSamples: RoundingSample[];
  priceSamplesRequested: number;
  priceSamples: SharePricePoint[];
}): CoverageNotice {
  return {
    reachedProvider: input.reachedProvider,
    conformance: input.conformance,
    roundingSamplesRequested: input.roundingSamplesRequested,
    roundingSamplesAvailable: input.roundingSamples.filter((s) => s.direction !== "unavailable").length,
    priceSamplesRequested: input.priceSamplesRequested,
    priceSamplesAvailable: input.priceSamples.filter((p) => p.sharePrice !== null).length,
  };
}
