import { z } from "zod";
import { HOLDING_CORRELATION_LIMITS } from "./limits";
import type { HoldingCorrelationState } from "./errors";

export const holdingCorrelationRequestSchema = z
  .object({
    walletAddress: z.string().min(1),
    network: z.string().min(1),
    walletNetwork: z.string().min(1),
    windowDays: z.number().int().min(1).max(HOLDING_CORRELATION_LIMITS.maxWindowDays).default(30),
    clusterThreshold: z.number().min(0.1).max(1).default(HOLDING_CORRELATION_LIMITS.defaultClusterThreshold),
  })
  .refine((v) => v.network === v.walletNetwork, {
    message: "walletNetwork must match network",
    path: ["walletNetwork"],
  });

export type HoldingCorrelationRequest = z.infer<typeof holdingCorrelationRequestSchema>;

export type PricePoint = { timestamp: number; price: number };

export type HoldingSeries = {
  assetId: string;
  symbol: string;
  balanceRaw: string;
  points: PricePoint[];
};

export type PairwiseCorrelation = {
  assetA: string;
  assetB: string;
  sampleSize: number;
  insufficientOverlap: boolean;
  pearson: number | null;
  spearman: number | null;
};

export type CorrelationCluster = {
  clusterId: string;
  threshold: number;
  assets: string[];
  minPairwisePearson: number;
};

export type ExcludedHolding = {
  assetId: string;
  symbol: string;
  reason: "insufficient_history" | "zero_variance" | "missing_price_feed";
  availablePoints: number;
  requiredPoints: number;
};

export type CoverageNotice = {
  reachedProvider: boolean;
  holdingsEvaluated: number;
  holdingsIncluded: number;
  holdingsExcluded: number;
  minOverlapPoints: number;
  windowDays: number;
};

export type HoldingCorrelationResult = {
  network: string;
  walletAddress: string;
  windowDays: number;
  clusterThreshold: number;
  state: HoldingCorrelationState;
  includedAssets: Array<{ assetId: string; symbol: string; pointCount: number }>;
  pairs: PairwiseCorrelation[];
  clusters: CorrelationCluster[];
  exclusions: ExcludedHolding[];
  coverage: CoverageNotice;
  warnings: string[];
};
