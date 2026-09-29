/**
 * Versioned contract for the peg deviation workspace.
 *
 * The premise the feature rejects is that a "stable" label implies a one-dollar
 * target. A peg here is always an explicit triple — reference currency, target
 * value, and where that claim came from — and an asset without one is analysed
 * by nobody.
 */
import { z } from "zod";

export const PEG_SCHEMA_VERSION = "peg-observations/2026-01" as const;

export const PEG_LIMITS = {
  maxAssets: 12,
  maxObservationsPerAsset: 2_000,
  maxReferenceRates: 2_000,
  maxRequestBytes: 1_048_576,
  /**
   * Two consecutive observations more than this far apart are treated as
   * separated by a gap: nothing is asserted about the interval between them.
   */
  defaultMaxGapSeconds: 3_600,
  /** An observation older than this relative to the window end is stale. */
  defaultStaleAfterSeconds: 86_400,
} as const;

/** Where a peg claim comes from. There is no "assumed" member on purpose. */
export type PegProvenance =
  | "issuer_disclosure"
  | "prospectus"
  | "operator_declared"
  | "protocol_documentation";

export type PegAssetIdentity = {
  chainId: string;
  family: "evm" | "stellar";
  symbol: string;
  issuer?: string;
  contractAddress?: string;
  /** Network-scoped canonical key; same symbol, different issuer stays distinct. */
  identityKey: string;
};

export type PegDefinition = {
  asset: PegAssetIdentity;
  /** ISO-4217-style code, or another asset's symbol for a non-fiat peg. */
  referenceCurrency: string;
  /** Target value in the reference currency. Not assumed to be 1. */
  targetValue: string;
  provenance: PegProvenance;
  declaredAt: string | null;
  note: string;
};

export type ObservationPoint = {
  observedAt: string;
  /** Price in the observation's own currency, as a decimal string. */
  rawPrice: string;
  rawCurrency: string;
  /** Price converted into the peg's reference currency; null when unavailable. */
  referencePrice: string | null;
  /** Signed deviation from target, in basis points. Null when unconverted. */
  deviationBps: number | null;
  /** Why `referencePrice` is null, when it is. */
  unavailableReason: string | null;
  sourceLabel: string;
  stale: boolean;
};

export type ObservationGap = {
  afterObservedAt: string;
  beforeObservedAt: string;
  gapSeconds: number;
  note: string;
};

export type DeviationEpisode = {
  /** First observation at or beyond the threshold. */
  startedAt: string;
  /** First observation back inside the threshold, or null if never observed. */
  recoveredAt: string | null;
  /**
   * Seconds between `startedAt` and `recoveredAt`. Null when recovery was not
   * observed, and never an estimate across a gap.
   */
  observedDurationSeconds: number | null;
  peakDeviationBps: number;
  direction: "above_target" | "below_target";
  observationCount: number;
  /** True when a gap falls inside the episode, so duration is a lower bound. */
  containsGap: boolean;
  note: string;
};

export type AssetCoverage = {
  state: "complete" | "partial" | "unavailable";
  observationCount: number;
  convertedCount: number;
  unconvertedCount: number;
  staleCount: number;
  duplicateTimestampCount: number;
  gapCount: number;
  longestGapSeconds: number;
  /** Fraction of the window covered by observed intervals, 0 to 1. */
  observedWindowFraction: number | null;
  note: string;
};

export type AssetAnalysis = {
  definition: PegDefinition;
  observations: ObservationPoint[];
  gaps: ObservationGap[];
  episodes: DeviationEpisode[];
  coverage: AssetCoverage;
  /** Largest absolute deviation actually observed, in basis points. */
  worstDeviationBps: number | null;
};

export type PegReport = {
  schemaVersion: typeof PEG_SCHEMA_VERSION;
  windowStart: string;
  windowEnd: string;
  thresholdBps: number;
  assets: AssetAnalysis[];
  /** Assets that arrived without a peg definition and were not analysed. */
  undefinedAssets: Array<{ identityKey: string; symbol: string; reason: string }>;
  coverage: {
    state: "complete" | "partial" | "empty";
    assetCount: number;
    analysedAssetCount: number;
    note: string;
  };
};

const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Values are non-negative decimal strings.")
  .max(40);

const assetSchema = z.object({
  chainId: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(64),
  issuer: z.string().trim().max(120).optional(),
  contractAddress: z.string().trim().max(120).optional(),
});

const definitionSchema = z.object({
  asset: assetSchema,
  referenceCurrency: z.string().trim().min(1).max(32),
  targetValue: decimalString,
  provenance: z.enum(["issuer_disclosure", "prospectus", "operator_declared", "protocol_documentation"]),
  declaredAt: z.string().datetime({ offset: true }).optional(),
});

const observationSchema = z.object({
  observedAt: z.string().datetime({ offset: true }),
  price: decimalString,
  currency: z.string().trim().min(1).max(32),
  sourceLabel: z.string().trim().min(1).max(160),
});

/**
 * A timestamped conversion rate. Conversion happens only when a rate exists at
 * or before the observation and inside the tolerance — never by interpolation.
 */
const referenceRateSchema = z.object({
  from: z.string().trim().min(1).max(32),
  to: z.string().trim().min(1).max(32),
  rate: decimalString,
  observedAt: z.string().datetime({ offset: true }),
  sourceLabel: z.string().trim().min(1).max(160),
});

export const pegRequestSchema = z.object({
  windowStart: z.string().datetime({ offset: true }),
  windowEnd: z.string().datetime({ offset: true }),
  /** Deviation magnitude, in basis points, that opens an episode. */
  thresholdBps: z.number().int().min(1).max(10_000).default(50),
  maxGapSeconds: z.number().int().min(1).max(2_592_000).default(PEG_LIMITS.defaultMaxGapSeconds),
  staleAfterSeconds: z.number().int().min(1).max(2_592_000).default(PEG_LIMITS.defaultStaleAfterSeconds),
  definitions: z.array(definitionSchema).max(PEG_LIMITS.maxAssets).default([]),
  series: z
    .array(
      z.object({
        asset: assetSchema,
        observations: z.array(observationSchema).max(PEG_LIMITS.maxObservationsPerAsset),
      }),
    )
    .max(PEG_LIMITS.maxAssets),
  referenceRates: z.array(referenceRateSchema).max(PEG_LIMITS.maxReferenceRates).default([]),
  /** Tolerance for matching a rate to an observation, in seconds. */
  rateToleranceSeconds: z.number().int().min(0).max(2_592_000).default(3_600),
});

export type PegRequest = z.infer<typeof pegRequestSchema>;
export type PegDefinitionInput = z.infer<typeof definitionSchema>;
export type ObservationInput = z.infer<typeof observationSchema>;
export type ReferenceRateInput = z.infer<typeof referenceRateSchema>;
export type PegAssetInput = z.infer<typeof assetSchema>;

export class PegError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "PegError";
    this.code = code;
    this.details = details;
  }
}
