import { alignReturnSeries } from "./alignment";
import { isSupportedCorrelationNetwork, normalizeAssetId } from "./assetIdentity";
import { buildCorrelationClusters } from "./clustering";
import { computePearson, computeSpearman } from "./correlation";
import { buildCorrelationCoverage } from "./coverage";
import { HoldingCorrelationError } from "./errors";
import { partitionHoldingsByHistory } from "./exclusions";
import { createDefaultHoldingsReader, type HoldingsPriceProvider } from "./holdingsReader";
import { HOLDING_CORRELATION_LIMITS } from "./limits";
import { computeReturnMap } from "./priceSeries";
import {
  holdingCorrelationRequestSchema,
  type HoldingCorrelationResult,
  type PairwiseCorrelation,
} from "./schema";

export async function analyzeHoldingCorrelation(
  rawInput: unknown,
  deps: { provider?: HoldingsPriceProvider } = {},
): Promise<HoldingCorrelationResult> {
  const parsed = holdingCorrelationRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new HoldingCorrelationError("Invalid holding correlation request", "invalid_request", false);
  }
  const input = parsed.data;
  if (!isSupportedCorrelationNetwork(input.network)) {
    throw new HoldingCorrelationError(`Unsupported network: ${input.network}`, "unsupported_network", false);
  }

  const provider = deps.provider ?? createDefaultHoldingsReader();
  let rawSeries;
  try {
    rawSeries = await provider.loadHoldingsWithSeries({
      walletAddress: input.walletAddress,
      network: input.network,
      windowDays: input.windowDays,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Price series provider unavailable";
    return {
      network: input.network,
      walletAddress: input.walletAddress,
      windowDays: input.windowDays,
      clusterThreshold: input.clusterThreshold,
      state: "unavailable",
      includedAssets: [],
      pairs: [],
      clusters: [],
      exclusions: [],
      coverage: buildCorrelationCoverage({
        reachedProvider: false,
        holdingsEvaluated: 0,
        holdingsIncluded: 0,
        holdingsExcluded: 0,
        minOverlapPoints: HOLDING_CORRELATION_LIMITS.minOverlapPoints,
        windowDays: input.windowDays,
      }),
      warnings: [message],
    };
  }

  const bounded = rawSeries.slice(0, HOLDING_CORRELATION_LIMITS.maxHoldings).map((s) => ({
    ...s,
    assetId: normalizeAssetId(s.assetId),
  }));

  const { included, exclusions } = partitionHoldingsByHistory(
    bounded,
    HOLDING_CORRELATION_LIMITS.minOverlapPoints,
  );

  const pairs: PairwiseCorrelation[] = [];
  for (let i = 0; i < included.length; i++) {
    for (let j = i + 1; j < included.length; j++) {
      const a = included[i]!;
      const b = included[j]!;
      const aligned = alignReturnSeries(a.points, b.points);
      const sampleSize = aligned.timestamps.length;
      if (sampleSize < HOLDING_CORRELATION_LIMITS.minOverlapPoints) {
        pairs.push({
          assetA: a.assetId,
          assetB: b.assetId,
          sampleSize,
          insufficientOverlap: true,
          pearson: null,
          spearman: null,
        });
      } else {
        pairs.push({
          assetA: a.assetId,
          assetB: b.assetId,
          sampleSize,
          insufficientOverlap: false,
          pearson: computePearson(aligned.returnsA, aligned.returnsB),
          spearman: computeSpearman(aligned.returnsA, aligned.returnsB),
        });
      }
    }
  }

  const clusters = buildCorrelationClusters(
    included.map((i) => i.assetId),
    pairs,
    input.clusterThreshold,
  );

  const warnings: string[] = [];
  if (exclusions.length > 0) {
    warnings.push(`${exclusions.length} holding(s) excluded due to insufficient or flat return history.`);
  }
  if (pairs.some((p) => p.insufficientOverlap)) {
    warnings.push("One or more asset pairs had fewer overlapping timestamps than required.");
  }

  const state = exclusions.length > 0 || pairs.some((p) => p.insufficientOverlap) ? "partial" : "complete";

  return {
    network: input.network,
    walletAddress: input.walletAddress,
    windowDays: input.windowDays,
    clusterThreshold: input.clusterThreshold,
    state,
    includedAssets: included.map((item) => ({
      assetId: item.assetId,
      symbol: item.symbol,
      pointCount: computeReturnMap(item.points).size,
    })),
    pairs,
    clusters,
    exclusions,
    coverage: buildCorrelationCoverage({
      reachedProvider: true,
      holdingsEvaluated: bounded.length,
      holdingsIncluded: included.length,
      holdingsExcluded: exclusions.length,
      minOverlapPoints: HOLDING_CORRELATION_LIMITS.minOverlapPoints,
      windowDays: input.windowDays,
    }),
    warnings,
  };
}
