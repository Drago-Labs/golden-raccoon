/**
 * Versioned contract for the evidence coverage and contradiction explorer.
 *
 * Two ideas drive the whole feature:
 *
 * 1. **Corroboration requires independence.** Five observations from one source
 *    family are one observation repeated, not five confirmations.
 * 2. **A contradiction must be provable.** Two values only conflict when they
 *    describe the same asset, in the same unit, over overlapping windows, and
 *    are structurally comparable. Free text is never adjudicated.
 */
import { z } from "zod";

export const EVIDENCE_SCHEMA_VERSION = "evidence-coverage/2026-01" as const;

export const EVIDENCE_LIMITS = {
  maxClaims: 400,
  maxObservationsPerClaim: 60,
  maxSources: 200,
  maxRequestBytes: 1_048_576,
  /** An observation older than this, relative to the report, is stale. */
  defaultStaleAfterSeconds: 900,
} as const;

/**
 * Whether two observation windows may be compared at all. Windows that do not
 * overlap describe different moments, so a difference between them is a change
 * over time rather than a disagreement.
 */
export type ComparabilityReason =
  | "comparable"
  | "different_identity"
  | "different_unit"
  | "disjoint_windows"
  | "unstructured_value"
  | "missing_timestamp";

export type SourceStatus = "connected" | "unavailable" | "mock";

/**
 * Age of an observation. `unknown` is deliberately distinct from `fresh`: an
 * observation with no timestamp is not young, it is unmeasured.
 */
export type FreshnessState = "fresh" | "stale" | "unknown";

export type SourceFamily = {
  /** Stable id for the family, e.g. an operator or an upstream data vendor. */
  familyId: string;
  label: string;
  /** Source labels that belong to this family. */
  memberLabels: string[];
  /** Why these sources are considered one family. */
  rationale: string;
};

export type SourceObservation = {
  observationId: string;
  sourceLabel: string;
  familyId: string;
  familyLabel: string;
  status: SourceStatus;
  observedAt: string | null;
  freshness: FreshnessState;
  ageSeconds: number | null;
  /** Structured value, when the source reported one. */
  value: { kind: "number"; amount: string; unit: string } | { kind: "text"; text: string } | null;
  /** Window the value describes, when declared. */
  windowStart: string | null;
  windowEnd: string | null;
  /** True when this observation was redacted before presentation. */
  redacted: boolean;
  note: string;
};

export type Contradiction = {
  claimId: string;
  leftObservationId: string;
  rightObservationId: string;
  reason: ComparabilityReason;
  /** Only set when `reason` is `comparable`. */
  difference: string | null;
  detail: string;
};

export type ClaimCoverage = {
  claimId: string;
  label: string;
  subjectIdentityKey: string;
  observationIds: string[];
  /** Distinct source families backing this claim. */
  independentFamilyCount: number;
  /** Observations that are duplicates within their own family. */
  redundantObservationCount: number;
  connectedCount: number;
  unavailableCount: number;
  freshCount: number;
  staleCount: number;
  unknownFreshnessCount: number;
  /**
   * `corroborated` — two or more independent families reported values that
   *   were actually comparable and agreed.
   * `single_family` — backed by one family only, however many observations.
   * `incomparable` — several families reported, but no two values could be
   *   compared, so they neither agree nor disagree.
   * `contradicted` — a provable conflict exists.
   * `uncovered` — no usable observation at all.
   */
  state: "corroborated" | "single_family" | "incomparable" | "contradicted" | "uncovered";
  /** Pairs that were comparable and agreed. */
  agreeingPairCount: number;
  note: string;
};

export type FreshnessBucket = {
  observedAt: string | null;
  observationIds: string[];
  freshness: FreshnessState;
};

export type EvidenceReportCoverage = {
  state: "complete" | "partial" | "empty";
  claimCount: number;
  corroboratedClaimCount: number;
  singleFamilyClaimCount: number;
  incomparableClaimCount: number;
  contradictedClaimCount: number;
  uncoveredClaimCount: number;
  redactedFieldCount: number;
  note: string;
};

export type EvidenceReport = {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  families: SourceFamily[];
  claims: ClaimCoverage[];
  observations: SourceObservation[];
  contradictions: Contradiction[];
  /** Comparisons that were attempted and rejected, with the reason. */
  incomparablePairs: Contradiction[];
  timeline: FreshnessBucket[];
  coverage: EvidenceReportCoverage;
};

const structuredValueSchema = z.union([
  z.object({
    kind: z.literal("number"),
    amount: z.string().trim().regex(/^-?\d+(\.\d+)?$/, "Numeric values are decimal strings."),
    unit: z.string().trim().min(1).max(40),
  }),
  z.object({ kind: z.literal("text"), text: z.string().max(2_000) }),
]);

const observationSchema = z.object({
  observationId: z.string().trim().min(1).max(120),
  sourceLabel: z.string().trim().min(1).max(160),
  status: z.enum(["connected", "unavailable", "mock"]),
  observedAt: z.string().datetime({ offset: true }).optional(),
  value: structuredValueSchema.optional(),
  windowStart: z.string().datetime({ offset: true }).optional(),
  windowEnd: z.string().datetime({ offset: true }).optional(),
  /** Arbitrary provider payload; scrubbed before it reaches the response. */
  raw: z.record(z.string(), z.unknown()).optional(),
});

const claimSchema = z.object({
  claimId: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  /** Canonical subject identity. Two claims about different assets never merge. */
  subject: z.object({
    chainId: z.string().trim().min(1).max(80),
    symbol: z.string().trim().min(1).max(64),
    issuer: z.string().trim().max(120).optional(),
    contractAddress: z.string().trim().max(120).optional(),
  }),
  observations: z.array(observationSchema).max(EVIDENCE_LIMITS.maxObservationsPerClaim),
});

/**
 * A declared source family. Families are declared, never inferred from a label
 * prefix: guessing that two sources share an operator would either invent
 * independence or destroy it.
 */
const familySchema = z.object({
  familyId: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  memberLabels: z.array(z.string().trim().min(1).max(160)).min(1).max(EVIDENCE_LIMITS.maxSources),
  rationale: z.string().trim().min(1).max(500),
});

export const evidenceRequestSchema = z.object({
  reportId: z.string().trim().min(1).max(120),
  generatedAt: z.string().datetime({ offset: true }),
  staleAfterSeconds: z.number().int().min(1).max(2_592_000).default(EVIDENCE_LIMITS.defaultStaleAfterSeconds),
  families: z.array(familySchema).max(EVIDENCE_LIMITS.maxSources).default([]),
  claims: z.array(claimSchema).max(EVIDENCE_LIMITS.maxClaims),
});

export type EvidenceRequest = z.infer<typeof evidenceRequestSchema>;
export type ObservationInput = z.infer<typeof observationSchema>;
export type ClaimInput = z.infer<typeof claimSchema>;
export type FamilyInput = z.infer<typeof familySchema>;

export class EvidenceError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "EvidenceError";
    this.code = code;
    this.details = details;
  }
}
