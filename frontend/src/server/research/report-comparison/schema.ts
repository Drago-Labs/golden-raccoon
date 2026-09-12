import { z } from "zod";
import type { RiskSnapshotAsset } from "@/server/snapshots/schema";

/** Schema version of the comparison document produced by this feature. */
export const REPORT_COMPARISON_SCHEMA_VERSION = "report-comparison/2026-01" as const;

/** Operational bounds for comparison requests to ensure bounded compute. */
export const COMPARISON_LIMITS = {
  maxFactors: 500,
  maxSources: 120,
  maxMissingData: 120,
  maxRequestBytes: 512_000,
} as const;

export type ComparisonValidationErrorCode =
  | "invalid_request"
  | "not_found"
  | "revoked"
  | "expired"
  | "tampered"
  | "unknown_version"
  | "cross_asset"
  | "cross_network"
  | "invalid_snapshot"
  | "comparison_too_large";

/**
 * Typed validation error thrown when snapshot reading, comparability checks,
 * or factor comparisons fail closed.
 */
export class ComparisonValidationError extends Error {
  readonly code: ComparisonValidationErrorCode;
  readonly details?: unknown;

  constructor(code: ComparisonValidationErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ComparisonValidationError";
    this.code = code;
    this.details = details;
  }
}

export type ScoreDeltaDirection = "increased" | "decreased" | "unchanged";

export type ImpactDeltaState =
  | "numeric_delta"
  | "unknown_to_known"
  | "known_to_unknown"
  | "both_unknown"
  | "unchanged";

export type FactorDeltaStatus = "added" | "removed" | "changed" | "unchanged" | "ambiguous";

export type SourceDeltaStatus =
  | "added"
  | "removed"
  | "disappeared"
  | "reconnected"
  | "stale"
  | "fresh"
  | "unchanged";

export type ComparabilityMode = "complete" | "partial" | "empty" | "unavailable";

export type ComparisonFactor = {
  key?: string;
  label: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info" | string;
  impact?: number | null;
  weight?: number | null;
  detail?: string;
  sourceLabel?: string;
  critical?: boolean;
};

export type FactorDeltaItem = {
  key: string;
  label: string;
  category: string;
  status: FactorDeltaStatus;
  critical: boolean;
  severity: {
    base?: string;
    target?: string;
    changed: boolean;
  };
  impact: {
    base?: number | null;
    target?: number | null;
    delta?: number | null;
    state: ImpactDeltaState;
  };
  baseDetail?: string;
  targetDetail?: string;
  sourceLabels?: {
    base?: string;
    target?: string;
  };
  ambiguityReason?: string;
};

export type FactorMatchResult = {
  summary: {
    addedCount: number;
    removedCount: number;
    changedCount: number;
    unchangedCount: number;
    ambiguousCount: number;
    criticalChangesCount: number;
    hasMaterialDelta: boolean;
  };
  items: FactorDeltaItem[];
};

export type ScoreMetricDelta = {
  base: number;
  target: number;
  delta: number;
  direction: ScoreDeltaDirection;
};

export type MissingDataFieldDelta = {
  field: string;
  impact: "low" | "medium" | "high";
};

export type MissingDataDelta = {
  added: MissingDataFieldDelta[];
  removed: MissingDataFieldDelta[];
  retained: MissingDataFieldDelta[];
  totalBase: number;
  totalTarget: number;
  unknownToKnown: string[];
  knownToUnknown: string[];
};

export type ScoreDelta = {
  buyRisk: ScoreMetricDelta;
  confidence: ScoreMetricDelta;
  verdict: {
    base: string;
    target: string;
    changed: boolean;
  };
  missingData: MissingDataDelta;
};

export type SourceDeltaItem = {
  label: string;
  baseStatus?: "connected" | "unavailable" | "mock" | "missing";
  targetStatus?: "connected" | "unavailable" | "mock" | "missing";
  baseCheckedAt?: string;
  targetCheckedAt?: string;
  freshnessDeltaSeconds?: number;
  reliabilityDelta?: number;
  status: SourceDeltaStatus;
  isDisappearedRiskEvidence: boolean;
  note?: string;
};

export type SourceDeltaResult = {
  summary: {
    totalBaseSources: number;
    totalTargetSources: number;
    connectedBaseSources: number;
    connectedTargetSources: number;
    disappearedCount: number;
    reconnectedCount: number;
  };
  items: SourceDeltaItem[];
};

export type ComparabilityResult = {
  comparable: boolean;
  mode: ComparabilityMode;
  reasons: string[];
  dataQuality: {
    base: string;
    target: string;
  };
};

export type ObservationMetadata = {
  id?: string;
  canonicalHash?: string;
  generatedAt: string;
  staleAt?: string;
};

export type ComparisonSubject = {
  canonicalIdentity: string;
  network: string;
  chainFamily: string;
  symbol: string;
  asset: RiskSnapshotAsset;
  baseObservation: ObservationMetadata;
  targetObservation: ObservationMetadata;
  timeElapsedSeconds: number;
};

export type ReportComparisonDocument = {
  schemaVersion: typeof REPORT_COMPARISON_SCHEMA_VERSION;
  comparability: ComparabilityResult;
  subject: ComparisonSubject;
  scoreDelta: ScoreDelta;
  factors: FactorMatchResult;
  sources: SourceDeltaResult;
  summary: string;
  notices: {
    informationOnly: true;
    disappearingSourcesAreNotResolvedRisks: true;
  };
};

export const reportComparisonRequestSchema = z
  .object({
    baseId: z.string().trim().min(1).max(200).optional(),
    targetId: z.string().trim().min(1).max(200).optional(),
    baseSnapshot: z.unknown().optional(),
    targetSnapshot: z.unknown().optional(),
    baseFactors: z.array(z.unknown()).max(COMPARISON_LIMITS.maxFactors).optional(),
    targetFactors: z.array(z.unknown()).max(COMPARISON_LIMITS.maxFactors).optional(),
  })
  .refine(
    (data) => (data.baseId !== undefined || data.baseSnapshot !== undefined) && (data.targetId !== undefined || data.targetSnapshot !== undefined),
    { message: "Both base and target snapshot identifiers or documents must be provided." },
  );

export type ReportComparisonRequest = z.infer<typeof reportComparisonRequestSchema>;

/**
 * Validates whether an unknown object conforms to the shape of ReportComparisonRequest.
 *
 * @param input - The unknown payload to validate.
 * @returns The validated ReportComparisonRequest object.
 */
export function validateReportComparisonRequest(input: unknown): ReportComparisonRequest {
  const result = reportComparisonRequestSchema.safeParse(input);
  if (!result.success) {
    throw new ComparisonValidationError("invalid_request", "Invalid report comparison request payload.", result.error.flatten());
  }
  return result.data;
}
