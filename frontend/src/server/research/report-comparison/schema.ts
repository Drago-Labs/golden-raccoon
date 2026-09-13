/**
 * Versioned contract for semantic comparison of two saved risk snapshots.
 *
 * The comparison is descriptive: it reports what changed between two
 * observations and, just as importantly, what stopped being observable. A
 * source that disappeared is never rendered as a resolved risk.
 */
import { z } from "zod";

export const COMPARISON_SCHEMA_VERSION = "report-comparison/2026-01" as const;

/** Snapshot document versions this comparison knows how to read. */
export const SUPPORTED_SNAPSHOT_VERSIONS = ["1"] as const;

export const COMPARISON_LIMITS = {
  maxEvidenceEntries: 100,
  maxMissingDataEntries: 100,
  maxReasonEntries: 20,
  /** Tolerance below which a numeric move is reported as unchanged. */
  scoreEpsilon: 1e-9,
} as const;

/**
 * How a value moved between the two observations.
 *
 * `unknown_to_known` and `known_to_unknown` exist so that gaining or losing
 * visibility is never collapsed into a numeric increase or decrease.
 */
export type DeltaDirection =
  | "increase"
  | "decrease"
  | "unchanged"
  | "unknown_to_known"
  | "known_to_unknown"
  | "unknown_both";

export type ChangeStatus = "added" | "removed" | "changed" | "unchanged" | "ambiguous";

export type ComparisonAsset = {
  chainFamily: "evm" | "stellar";
  network: string;
  symbol: string;
  identityKind: string;
  canonicalId: string;
  /** Chain-and-network qualified identity. Never collapses across networks. */
  identityKey: string;
};

export type ObservationMeta = {
  snapshotId: string;
  schemaVersion: string;
  canonicalHash: string;
  createdAt: string;
  expiresAt: string;
  /** When the underlying report was generated, distinct from `createdAt`. */
  generatedAt: string;
  staleAt: string;
};

export type ScoreDelta = {
  field: "buyRisk" | "confidence";
  left: number | null;
  right: number | null;
  absoluteChange: number | null;
  direction: DeltaDirection;
  note: string;
};

export type VerdictDelta = {
  left: string | null;
  right: string | null;
  changed: boolean;
  note: string;
};

export type MissingDataDelta = {
  field: string;
  status: ChangeStatus;
  leftImpact: string | null;
  rightImpact: string | null;
  note: string;
};

export type FactorChange = {
  /** Stable semantic key, derived from normalized content rather than order. */
  key: string;
  kind: "top_reason" | "missing_data";
  status: ChangeStatus;
  leftText: string | null;
  rightText: string | null;
  /** Candidate keys when a match was ambiguous. */
  candidates?: string[];
  note: string;
};

export type SourceChange = {
  label: string;
  status: ChangeStatus;
  leftStatus: "connected" | "unavailable" | null;
  rightStatus: "connected" | "unavailable" | null;
  leftCheckedAt: string | null;
  rightCheckedAt: string | null;
  freshnessDelta: ScoreDelta | null;
  reliabilityDelta: ScoreDelta | null;
  /**
   * True when this source stopped being observable. Callers must not present
   * such a change as an improvement in risk.
   */
  evidenceLost: boolean;
  note: string;
};

export type ComparabilityVerdict = {
  comparable: boolean;
  /** Machine-readable reasons; empty when `comparable` is true. */
  blockers: Array<{ code: string; detail: string }>;
  /** Non-blocking caveats that qualify an otherwise valid comparison. */
  caveats: string[];
};

export type ComparisonCoverage = {
  state: "complete" | "partial" | "empty";
  comparedSources: number;
  lostSources: number;
  gainedSources: number;
  changedFactors: number;
  ambiguousFactors: number;
  note: string;
};

export type ReportComparison = {
  schemaVersion: typeof COMPARISON_SCHEMA_VERSION;
  asset: ComparisonAsset;
  left: ObservationMeta;
  right: ObservationMeta;
  comparability: ComparabilityVerdict;
  scores: ScoreDelta[];
  verdict: VerdictDelta;
  factors: FactorChange[];
  missingData: MissingDataDelta[];
  sources: SourceChange[];
  coverage: ComparisonCoverage;
  /** True when nothing material differs between the two observations. */
  materiallyIdentical: boolean;
};

const snapshotIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^snapshot_[A-Za-z0-9-]+$/, "Snapshot ids look like snapshot_<uuid>.");

export const comparisonRequestSchema = z
  .object({
    leftId: snapshotIdSchema,
    rightId: snapshotIdSchema,
  })
  .refine((value) => value.leftId !== value.rightId, {
    message: "Choose two different snapshots to compare.",
    path: ["rightId"],
  });

export type ComparisonRequest = z.infer<typeof comparisonRequestSchema>;

/** Failure that should surface to the caller as-is rather than as a 500. */
export class ComparisonError extends Error {
  readonly code: string;
  readonly detail: string;
  readonly side?: "left" | "right";

  constructor(code: string, detail: string, side?: "left" | "right") {
    super(detail);
    this.name = "ComparisonError";
    this.code = code;
    this.detail = detail;
    this.side = side;
  }
}
