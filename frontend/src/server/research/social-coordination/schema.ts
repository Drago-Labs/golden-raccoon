/**
 * Versioned contract for coordinated-activity pattern analysis.
 *
 * The line this feature refuses to cross: it reports **measured repetition**,
 * never inferred intent. It does not call an account a bot, does not
 * deanonymize anyone, and does not claim a pattern was coordinated — it says
 * what the observations show and publishes the thresholds that produced each
 * flag, so a reader can disagree with the threshold rather than the verdict.
 */
import { z } from "zod";

export const COORDINATION_SCHEMA_VERSION = "social-coordination/2026-01" as const;

/**
 * Published thresholds. These are part of the contract, not tuning constants:
 * every flagged pattern names the threshold it crossed.
 */
export const COORDINATION_THRESHOLDS = {
  /** Below this many observations, no pattern claim is made at all. */
  minObservationsForAnalysis: 12,
  /** Below this many distinct authors, participation cannot be assessed. */
  minAuthorsForConcentration: 5,
  /** Normalized text similarity at or above this counts as a repeat. */
  repeatSimilarity: 0.9,
  /** Bucket width for burst detection, in seconds. */
  burstBucketSeconds: 300,
  /** A bucket at or above this multiple of the median is a burst. */
  burstMultiple: 4,
  /** A cluster needs at least this many messages to be reported. */
  minClusterSize: 3,
  /** Share of messages from the top author at or above this is concentrated. */
  concentrationShare: 0.4,
} as const;

export const COORDINATION_LIMITS = {
  maxObservations: 5_000,
  maxRequestBytes: 2_097_152,
  /** Longest text kept per observation after normalization. */
  maxTextLength: 2_000,
} as const;

export type EvidenceStrength = "measured" | "insufficient_evidence";

export type ObservationRef = {
  observationId: string;
  /** Opaque, caller-supplied author handle. Never resolved to an identity. */
  authorKey: string;
  postedAt: string | null;
  /** Sanitized text; never rendered as markup. */
  text: string;
  normalizedTextHash: string;
  tokenCount: number;
  /** Set when this observation could not take part in analysis. */
  excludedReason: string | null;
};

export type MessageCluster = {
  clusterId: string;
  /** Representative text, sanitized. */
  sampleText: string;
  observationIds: string[];
  /** Distinct authors, so one account posting ten times is one author. */
  distinctAuthorCount: number;
  earliestPostedAt: string | null;
  latestPostedAt: string | null;
  /** Seconds between first and last, when both are known. */
  spanSeconds: number | null;
  matchKind: "identical_text" | "near_identical_text";
  note: string;
};

export type ActivityBucket = {
  startsAt: string;
  observationCount: number;
  distinctAuthorCount: number;
  /** Ratio of this bucket's count to the median bucket count. */
  multipleOfMedian: number | null;
  isBurst: boolean;
};

export type ParticipationRow = {
  authorKey: string;
  observationCount: number;
  distinctClusterCount: number;
  /** Share of all analysable observations, 0 to 1. */
  share: number;
  firstPostedAt: string | null;
  lastPostedAt: string | null;
};

/**
 * A pattern the observations support. Every finding names the threshold it
 * crossed and the observations behind it.
 */
export type PatternFinding = {
  findingId: string;
  kind: "repeated_text" | "synchronized_burst" | "participation_concentration";
  strength: EvidenceStrength;
  /** Plain statement of what was measured, with no claim about why. */
  measurement: string;
  /** The published threshold this measurement is compared against. */
  threshold: string;
  supportingObservationIds: string[];
  /** What the measurement does *not* establish. */
  limitation: string;
};

export type SamplingNotice = {
  /** Fraction of the caller's observations that could be analysed, 0 to 1. */
  analysedFraction: number;
  observationCount: number;
  analysedCount: number;
  excludedCount: number;
  missingTimestampCount: number;
  distinctAuthorCount: number;
  /** True when the caller declared the sample is not exhaustive. */
  callerDeclaredPartial: boolean;
  notes: string[];
};

export type CoordinationCoverage = {
  state: "complete" | "partial" | "insufficient" | "empty";
  note: string;
};

export type CoordinationReport = {
  schemaVersion: typeof COORDINATION_SCHEMA_VERSION;
  observedAt: string;
  thresholds: typeof COORDINATION_THRESHOLDS;
  observations: ObservationRef[];
  clusters: MessageCluster[];
  timeline: ActivityBucket[];
  participation: ParticipationRow[];
  findings: PatternFinding[];
  sampling: SamplingNotice;
  coverage: CoordinationCoverage;
  /** This feature changes no social score or recommendation. */
  scoreUnchanged: true;
};

const observationSchema = z.object({
  observationId: z.string().trim().min(1).max(160),
  /**
   * Opaque author key supplied by the caller. This feature never asks for a
   * real name, a follower graph, or anything that is not already public.
   */
  authorKey: z.string().trim().min(1).max(200),
  postedAt: z.string().datetime({ offset: true }).optional(),
  text: z.string().max(COORDINATION_LIMITS.maxTextLength).optional(),
});

export const coordinationRequestSchema = z.object({
  observedAt: z.string().datetime({ offset: true }),
  /** The caller states whether the sample is exhaustive. Default: assume not. */
  sampleIsExhaustive: z.boolean().default(false),
  observations: z.array(observationSchema).max(COORDINATION_LIMITS.maxObservations),
});

export type CoordinationRequest = z.infer<typeof coordinationRequestSchema>;
export type ObservationInput = z.infer<typeof observationSchema>;

export class CoordinationError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CoordinationError";
    this.code = code;
    this.details = details;
  }
}
