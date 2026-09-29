/**
 * Versioned contract for the risk explanation workbench.
 *
 * The workbench is a read-only lens over an existing `RiskReport`. Nothing in
 * this module recomputes a score, and every exported shape is keyed so a single
 * contribution can always be traced back to the agent and factor that produced
 * it — including when two agents publish factors with the same label.
 */
import { z } from "zod";

/** Schema version of the explanation document produced by this feature. */
export const EXPLANATION_SCHEMA_VERSION = "risk-explanation/2026-01" as const;

/**
 * Report shapes this feature knows how to read. An unknown version fails
 * validation rather than being interpreted optimistically.
 */
export const SUPPORTED_REPORT_VERSIONS = ["risk-report/v1"] as const;

/** Bounds that keep a single analysis request cheap and ephemeral. */
export const EXPLANATION_LIMITS = {
  maxAgentCards: 24,
  maxFactorsPerAgent: 120,
  maxTotalFactors: 600,
  maxSources: 120,
  maxMissingData: 120,
  maxRequestBytes: 512_000,
} as const;

export type ExplanationContributionKind = "scored" | "descriptive";

export type EvidenceLinkState =
  | "resolved"
  | "label_only"
  | "unlinked"
  | "ambiguous";

export type ReconciliationModel = "additive" | "non_additive" | "unavailable";

export type CanonicalAssetIdentity = {
  /** Chain id exactly as the report recorded it. */
  chain: string;
  /** `evm` or `stellar`, derived from the chain id. */
  family: "evm" | "stellar" | "unknown";
  symbol: string;
  assetType?: string;
  contractAddress?: string;
  issuer?: string;
  /**
   * Stable identity string. Two assets sharing a symbol on different networks
   * never collapse onto the same key.
   */
  identityKey: string;
};

export type ExplanationSubject = {
  reportId: string;
  reportVersion: string;
  reportCreatedAt: string;
  asset: CanonicalAssetIdentity;
  buyRisk: number;
  confidence: number;
  verdict: string;
  summary: string;
};

export type EvidenceLink = {
  state: EvidenceLinkState;
  /** The label the factor claimed, when it declared one at all. */
  claimedLabel?: string;
  /** Resolved source entry, present only when `state` is `resolved`. */
  source?: {
    label: string;
    status: "mock" | "connected" | "unavailable";
    url?: string;
    detail?: string;
    checkedAt?: string;
    provider?: string;
    reliability?: number;
  };
  /** Human-readable reason the link is not resolved. */
  note?: string;
};

export type ExplanationContribution = {
  /** Stable key: agent, category, label and a per-agent ordinal. */
  key: string;
  agent: string;
  agentDisplayName: string;
  agentStatus: string;
  label: string;
  category: string;
  severity: string;
  direction: string;
  detail: string;
  kind: ExplanationContributionKind;
  /** Recorded magnitude. `null` for descriptive factors. */
  impact: number | null;
  weight: number | null;
  critical: boolean;
  evidence: EvidenceLink;
};

export type AgentReconciliation = {
  agent: string;
  agentDisplayName: string;
  model: ReconciliationModel;
  reportedScore: number;
  /** Only set when `model` is `additive`. */
  attributedScore: number | null;
  /** Only set when `model` is `additive`. */
  unexplainedRemainder: number | null;
  scoredFactorCount: number;
  descriptiveFactorCount: number;
  /** Plain-language qualifications shown next to every number above. */
  qualifiers: string[];
};

export type ScoreReconciliation = {
  model: ReconciliationModel;
  reportedBuyRisk: number;
  /** Never a decomposition of `reportedBuyRisk` unless `model` is `additive`. */
  attributedBuyRisk: number | null;
  unexplainedRemainder: number | null;
  perAgent: AgentReconciliation[];
  qualifiers: string[];
};

export type ConfidenceGap = {
  id: string;
  field: string;
  reason: string;
  impact: "low" | "medium" | "high";
  requiredFor?: string;
  canRetry: boolean;
  fallbackUsed: boolean;
  /** Agent that reported the gap, or `report` for report-level entries. */
  scope: string;
};

export type ExplanationNode = {
  id: string;
  kind: "root" | "verdict" | "blockers" | "agent" | "factor" | "gaps";
  label: string;
  detail: string;
  /** Contribution key when the node represents a single factor. */
  contributionKey?: string;
  /** Non-color severity token; never the sole carrier of meaning. */
  severity?: string;
  children: ExplanationNode[];
};

export type EvidenceSourceSummary = {
  label: string;
  status: "mock" | "connected" | "unavailable";
  url?: string;
  provider?: string;
  detail?: string;
  checkedAt?: string;
  reliability?: number;
  /** Contribution keys that resolved to this source. */
  contributionKeys: string[];
};

export type ExplanationCoverage = {
  totalContributions: number;
  scoredContributions: number;
  descriptiveContributions: number;
  resolvedEvidence: number;
  labelOnlyEvidence: number;
  unlinkedEvidence: number;
  ambiguousEvidence: number;
  criticalBlockers: number;
  /**
   * `complete` when every contribution resolved to a source and the report
   * carried no missing data; `partial` when some evidence is unlinked or gaps
   * exist; `empty` when the report carried no factors at all.
   */
  state: "complete" | "partial" | "empty";
  note: string;
};

export type RiskExplanation = {
  schemaVersion: typeof EXPLANATION_SCHEMA_VERSION;
  subject: ExplanationSubject;
  contributions: ExplanationContribution[];
  reconciliation: ScoreReconciliation;
  tree: ExplanationNode;
  confidenceGaps: ConfidenceGap[];
  sources: EvidenceSourceSummary[];
  criticalBlockers: ExplanationContribution[];
  coverage: ExplanationCoverage;
};

const sourceSchema = z.object({
  label: z.string().min(1),
  url: z.string().optional(),
  status: z.enum(["mock", "connected", "unavailable"]),
  detail: z.string().optional(),
  checkedAt: z.string().optional(),
  provider: z.string().optional(),
  reliability: z.number().optional(),
});

const factorSchema = z.object({
  label: z.string().min(1),
  category: z.string().min(1),
  impact: z.number(),
  weight: z.number().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  detail: z.string(),
  sourceLabel: z.string().optional(),
  direction: z.enum(["risk_increase", "risk_decrease", "neutral"]),
});

const missingDataSchema = z.object({
  field: z.string().min(1),
  reason: z.string(),
  impact: z.enum(["low", "medium", "high"]),
  requiredFor: z.string().optional(),
  canRetry: z.boolean().optional(),
  fallbackUsed: z.boolean().optional(),
});

const agentCardSchema = z.object({
  agent: z.string().min(1),
  displayName: z.string().min(1),
  score: z.number(),
  scoreKind: z.string(),
  confidence: z.number(),
  status: z.string(),
  summary: z.string(),
  factors: z.array(factorSchema).max(EXPLANATION_LIMITS.maxFactorsPerAgent),
  criticalFactors: z.array(factorSchema).max(EXPLANATION_LIMITS.maxFactorsPerAgent).optional(),
  sources: z.array(sourceSchema).max(EXPLANATION_LIMITS.maxSources),
  missingData: z.array(missingDataSchema).max(EXPLANATION_LIMITS.maxMissingData),
});

/** Minimal read-only projection of `RiskReport` this feature depends on. */
export const explanationReportSchema = z.object({
  id: z.string().min(1),
  chain: z.string().min(1),
  contractAddress: z.string().optional(),
  symbol: z.string().min(1),
  tokenName: z.string().optional(),
  buyRisk: z.number(),
  confidence: z.number(),
  verdict: z.string().min(1),
  summary: z.string(),
  topReasons: z.array(z.string()).default([]),
  input: z
    .object({
      chain: z.string().optional(),
      assetType: z.string().optional(),
      issuer: z.string().optional(),
      assetKey: z.string().optional(),
      contractAddress: z.string().optional(),
      symbol: z.string().optional(),
    })
    .partial()
    .optional(),
  agentCards: z.array(agentCardSchema).max(EXPLANATION_LIMITS.maxAgentCards),
  sources: z.array(sourceSchema).max(EXPLANATION_LIMITS.maxSources),
  missingData: z.array(missingDataSchema).max(EXPLANATION_LIMITS.maxMissingData),
  createdAt: z.string().min(1),
});

export type ExplanationReport = z.infer<typeof explanationReportSchema>;
export type ExplanationFactor = z.infer<typeof factorSchema>;
export type ExplanationSource = z.infer<typeof sourceSchema>;
export type ExplanationMissingData = z.infer<typeof missingDataSchema>;
export type ExplanationAgentCard = z.infer<typeof agentCardSchema>;

export const explanationRequestSchema = z.object({
  reportVersion: z.enum(SUPPORTED_REPORT_VERSIONS).default("risk-report/v1"),
  report: explanationReportSchema,
});

export type ExplanationRequest = z.infer<typeof explanationRequestSchema>;

/** Error raised when the caller supplied something this version cannot read. */
export class ExplanationValidationError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ExplanationValidationError";
    this.code = code;
    this.details = details;
  }
}
