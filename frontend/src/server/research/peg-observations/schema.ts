import { z } from "zod";

export const chainFamilySchema = z.enum(["evm", "stellar"]);
export type ChainFamily = z.infer<typeof chainFamilySchema>;

export const canonicalAssetIdSchema = z.object({
  chainFamily: chainFamilySchema,
  network: z.string().min(1),
  symbol: z.string().min(1),
  addressOrIssuer: z.string().min(1),
});
export type CanonicalAssetId = z.infer<typeof canonicalAssetIdSchema>;

export const pegDefinitionSchema = z.object({
  assetId: canonicalAssetIdSchema,
  name: z.string().min(1),
  referenceCurrency: z.string().min(1),
  declaredTargetValue: z.number().positive(),
  source: z.enum(["canonical", "user_declared"]),
  provenance: z.string().min(1),
  toleranceBps: z.number().nonnegative().default(50),
  maxGapIntervalMs: z.number().positive().default(3_600_000),
});
export type PegDefinition = z.infer<typeof pegDefinitionSchema>;

export const rawObservationSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  price: z.number().positive(),
  currency: z.string().min(1),
  source: z.string().optional(),
  volume: z.number().nonnegative().optional(),
});
export type RawObservation = z.infer<typeof rawObservationSchema>;

export const normalizedObservationSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  rawPrice: z.number().positive(),
  rawCurrency: z.string().min(1),
  normalizedPrice: z.number().positive().nullable(),
  referenceCurrency: z.string().min(1),
  referenceRateUsed: z.number().positive().nullable().optional(),
  deviationBps: z.number().nullable(),
  isStale: z.boolean(),
  isRateMissing: z.boolean(),
  source: z.string(),
});
export type NormalizedObservation = z.infer<typeof normalizedObservationSchema>;

export const observationWindowSchema = z.object({
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  minIntervalMs: z.number().nonnegative(),
  maxIntervalMs: z.number().nonnegative(),
  averageIntervalMs: z.number().nonnegative(),
  gapCount: z.number().int().nonnegative(),
  maxGapDurationMs: z.number().nonnegative(),
});
export type ObservationWindow = z.infer<typeof observationWindowSchema>;

export const referenceRateSchema = z.object({
  fromCurrency: z.string().min(1),
  toCurrency: z.string().min(1),
  rate: z.number().positive(),
  timestamp: z.number().int().nonnegative(),
  source: z.string().min(1),
});
export type ReferenceRate = z.infer<typeof referenceRateSchema>;

export const episodeStatusSchema = z.enum(["recovered", "active", "interrupted_by_gap"]);
export type EpisodeStatus = z.infer<typeof episodeStatusSchema>;

export const deviationEpisodeSchema = z.object({
  id: z.string().min(1),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative().nullable(),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative().nullable(),
  durationMs: z.number().nonnegative().nullable(),
  peakDeviationBps: z.number(),
  peakTimestamp: z.number().int().nonnegative(),
  thresholdBps: z.number().positive(),
  status: episodeStatusSchema,
  recoveryDurationMs: z.number().nonnegative().nullable(),
  direction: z.enum(["above", "below"]),
  observationsCount: z.number().int().positive(),
});
export type DeviationEpisode = z.infer<typeof deviationEpisodeSchema>;

export const observationCoverageStatusSchema = z.enum([
  "complete",
  "partial",
  "sparse",
  "gap_interrupted",
  "missing_reference_rates",
  "empty",
  "unavailable",
]);
export type ObservationCoverageStatus = z.infer<typeof observationCoverageStatusSchema>;

export const gapIntervalSchema = z.object({
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});
export type GapInterval = z.infer<typeof gapIntervalSchema>;

export const observationCoverageSchema = z.object({
  status: observationCoverageStatusSchema,
  totalObservations: z.number().int().nonnegative(),
  validObservations: z.number().int().nonnegative(),
  duplicateTimestampsResolved: z.number().int().nonnegative(),
  outOfOrderObservationsSorted: z.number().int().nonnegative(),
  gapsDetected: z.array(gapIntervalSchema),
  missingRateTimestamps: z.array(z.number().int().nonnegative()),
  stalePointCount: z.number().int().nonnegative(),
  sourcingLimits: z.string(),
  coveragePercentage: z.number().min(0).max(100),
});
export type ObservationCoverage = z.infer<typeof observationCoverageSchema>;

export const pegAnalysisSummarySchema = z.object({
  currentPrice: z.number().nullable(),
  currentDeviationBps: z.number().nullable(),
  minDeviationBps: z.number().nullable(),
  maxDeviationBps: z.number().nullable(),
  meanDeviationBps: z.number().nullable(),
  stdDevBps: z.number().nullable(),
  activeEpisodesCount: z.number().int().nonnegative(),
  recoveredEpisodesCount: z.number().int().nonnegative(),
  interruptedEpisodesCount: z.number().int().nonnegative(),
});
export type PegAnalysisSummary = z.infer<typeof pegAnalysisSummarySchema>;

export const pegAnalysisRequestSchema = z.object({
  assetId: canonicalAssetIdSchema,
  customPegDefinition: pegDefinitionSchema.partial().optional(),
  observations: z.array(rawObservationSchema).optional(),
  referenceRates: z.array(referenceRateSchema).optional(),
  window: z
    .object({
      startTime: z.number().int().nonnegative().optional(),
      endTime: z.number().int().nonnegative().optional(),
    })
    .optional(),
  thresholdBps: z.number().positive().default(50),
  gapToleranceMs: z.number().positive().default(3_600_000),
  stalenessThresholdMs: z.number().positive().default(86_400_000),
  fixture: z.string().optional(),
});
export type PegAnalysisRequest = z.infer<typeof pegAnalysisRequestSchema>;

export const pegAnalysisQuerySchema = z.object({
  symbol: z.string().default("USDC"),
  network: z.string().default("ethereum"),
  chainFamily: chainFamilySchema.default("evm"),
  addressOrIssuer: z.string().default("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
  thresholdBps: z.coerce.number().positive().default(50),
  gapToleranceMs: z.coerce.number().positive().default(3_600_000),
  fixture: z.string().optional(),
});
export type PegAnalysisQuery = z.infer<typeof pegAnalysisQuerySchema>;

export const pegAnalysisResultSchema = z.object({
  pegDefinition: pegDefinitionSchema,
  window: observationWindowSchema,
  coverage: observationCoverageSchema,
  normalizedObservations: z.array(normalizedObservationSchema),
  episodes: z.array(deviationEpisodeSchema),
  summary: pegAnalysisSummarySchema,
  provenance: z.object({
    evaluatedAt: z.string(),
    evaluator: z.string(),
    sourcingLimits: z.string(),
  }),
});
export type PegAnalysisResult = z.infer<typeof pegAnalysisResultSchema>;
