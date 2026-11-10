import { z } from "zod";
import { VOLATILITY_PROFILE_LIMITS } from "./limits";
import type { VolatilityProfileState } from "./errors";

export const intervalSchema = z.enum(["1h", "1d"]);
export type SeriesInterval = z.infer<typeof intervalSchema>;

export const volatilityProfileRequestSchema = z
  .object({
    walletAddress: z.string().min(1),
    network: z.string().min(1),
    walletNetwork: z.string().min(1),
    assetSymbol: z.string().min(1).max(24),
    interval: intervalSchema.default("1d"),
    windowDays: z.number().int().min(2).max(VOLATILITY_PROFILE_LIMITS.maxWindowDays).default(30),
    compareAssetSymbol: z.string().min(1).max(24).optional(),
    compareInterval: intervalSchema.optional(),
  })
  .refine((v) => v.network === v.walletNetwork, {
    message: "walletNetwork must match network",
    path: ["walletNetwork"],
  });

export type VolatilityProfileRequest = z.infer<typeof volatilityProfileRequestSchema>;

export type PriceObservation = { timestamp: number; price: number };

export type RecordedPriceSeries = {
  assetSymbol: string;
  source: string;
  interval: SeriesInterval;
  expectedStepSeconds: number;
  observations: PriceObservation[];
};

export type DetectedGap = {
  fromTimestamp: number;
  toTimestamp: number;
  elapsedSeconds: number;
  expectedSeconds: number;
};

export type LogReturnStep = {
  fromTimestamp: number;
  toTimestamp: number;
  logReturn: number;
  outlier: boolean;
};

export type DrawdownSummary = {
  maxDrawdownPct: number;
  peakTimestamp: number | null;
  troughTimestamp: number | null;
  recoveryTimestamp: number | null;
  drawdownDurationSeconds: number;
  recoveryDurationSeconds: number | null;
  series: Array<{ timestamp: number; drawdownPct: number }>;
};

export type VolatilityMetrics = {
  sampleSize: number;
  periodVolatility: number | null;
  annualisedVolatility: number | null;
  annualisationFactor: number;
};

export type SeriesComparison = {
  primaryAsset: string;
  compareAsset: string;
  interval: SeriesInterval;
  annualisedVolatilityDiff: number | null;
  maxDrawdownDiffPct: number;
};

export type CoverageNotice = {
  reachedProvider: boolean;
  source: string;
  interval: SeriesInterval;
  observationsRead: number;
  validReturnSteps: number;
  gapsDetected: number;
  outliersDetected: number;
};

export type VolatilityProfileResult = {
  network: string;
  assetSymbol: string;
  interval: SeriesInterval;
  windowDays: number;
  state: VolatilityProfileState;
  volatility: VolatilityMetrics;
  drawdown: DrawdownSummary;
  gaps: DetectedGap[];
  comparison: SeriesComparison | null;
  coverage: CoverageNotice;
  warnings: string[];
};
