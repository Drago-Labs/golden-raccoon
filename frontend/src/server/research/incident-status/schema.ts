/**
 * Versioned contract for incident-status evidence.
 *
 * Status labels here are *source claims*, never ground truth. A rumor that says
 * a patch landed remains a rumor; only an official advisory or project statement
 * may claim acknowledgement or mitigation. Same-name projects on different
 * networks stay distinct because identity is chain-aware.
 */
import { z } from "zod";

export const INCIDENT_SCHEMA_VERSION = "incident-status/2026-01" as const;

export const INCIDENT_LIMITS = {
  maxDocuments: 300,
  maxRequestBytes: 1_048_576,
  /** An update older than this, relative to observation, is stale without follow-up. */
  defaultStaleAfterSeconds: 86_400 * 14,
  nearDuplicateSimilarity: 0.82,
  minTokensForSimilarity: 12,
} as const;

/** Kind of publication supporting a status claim. */
export type DocumentKind =
  | "rumor"
  | "news_report"
  | "official_advisory"
  | "project_statement"
  | "remediation_update";

/**
 * Claimed lifecycle status. These are assertions from sources, not adjudicated
 * truth. `unknown` is explicit when a source cannot place the incident.
 */
export type ClaimedStatus = "reported" | "acknowledged" | "mitigated" | "reopened" | "unknown";

/** Whether the source is allowed to assert official acknowledgement or mitigation. */
export type Authority = "official" | "unofficial" | "unknown";

export type ProvenanceRole = "independent" | "syndicated_copy" | "same_outlet_repeat" | "unknown_provenance";

export type SubjectIdentity = {
  chainId: string;
  /** Stable protocol or asset key; never inferred from a display name alone. */
  protocolId: string;
  displayName: string;
  contractAddress: string | null;
  issuer: string | null;
  identityKey: string;
};

export type DocumentRef = {
  documentId: string;
  originalId: string | null;
  kind: DocumentKind;
  authority: Authority;
  claimedStatus: ClaimedStatus;
  /** Status after authority rules; rumor cannot become acknowledgement. */
  effectiveStatus: ClaimedStatus;
  statusReason: string;
  title: string;
  summary: string | null;
  outletId: string;
  domain: string;
  canonicalUrl: string | null;
  syndicatedFrom: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  subjectIdentityKey: string;
  role: ProvenanceRole;
  roleReason: string;
  tokenCount: number;
  stale: boolean;
  staleReason: string | null;
};

export type StatusTransition = {
  transitionId: string;
  fromStatus: ClaimedStatus | null;
  toStatus: ClaimedStatus;
  at: string | null;
  supportingDocumentIds: string[];
  /** True only when at least one *independent official* source backs the step. */
  officiallySupported: boolean;
  note: string;
};

export type Disagreement = {
  disagreementId: string;
  leftDocumentId: string;
  rightDocumentId: string;
  leftStatus: ClaimedStatus;
  rightStatus: ClaimedStatus;
  reason: "conflicting_official" | "official_vs_unofficial" | "stale_vs_fresh" | "missing_follow_up";
  detail: string;
};

export type TimelineEntry = {
  documentId: string;
  at: string | null;
  kind: "published" | "updated" | "unknown";
  effectiveStatus: ClaimedStatus;
  authority: Authority;
  title: string;
  note: string;
};

export type IncidentCoverage = {
  state: "complete" | "partial" | "empty" | "disputed";
  documentCount: number;
  independentOfficialCount: number;
  syndicatedCopyCount: number;
  rumorCount: number;
  staleCount: number;
  disagreementCount: number;
  unresolvedClaimCount: number;
  note: string;
};

export type IncidentReport = {
  schemaVersion: typeof INCIDENT_SCHEMA_VERSION;
  observedAt: string;
  subject: SubjectIdentity;
  documents: DocumentRef[];
  transitions: StatusTransition[];
  timeline: TimelineEntry[];
  disagreements: Disagreement[];
  coverage: IncidentCoverage;
  /** Explicit: this feature never mutates a news risk score. */
  scoreUnchanged: true;
};

const subjectSchema = z.object({
  chainId: z.string().trim().min(1).max(80),
  protocolId: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(160),
  contractAddress: z.string().trim().max(120).optional(),
  issuer: z.string().trim().max(120).optional(),
});

const documentSchema = z.object({
  documentId: z.string().trim().min(1).max(120),
  originalId: z.string().trim().max(160).optional(),
  kind: z.enum(["rumor", "news_report", "official_advisory", "project_statement", "remediation_update"]),
  authority: z.enum(["official", "unofficial", "unknown"]).optional(),
  claimedStatus: z.enum(["reported", "acknowledged", "mitigated", "reopened", "unknown"]),
  title: z.string().trim().min(1).max(400),
  summary: z.string().max(4_000).optional(),
  domain: z.string().trim().min(1).max(160),
  outletId: z.string().trim().min(1).max(160).optional(),
  url: z.string().max(2_000).optional(),
  syndicatedFrom: z.string().trim().max(160).optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  /** Must match the request subject; mismatched identity is rejected, not merged. */
  subject: subjectSchema.optional(),
});

export const incidentRequestSchema = z.object({
  observedAt: z.string().datetime({ offset: true }),
  staleAfterSeconds: z.number().int().min(60).max(2_592_000).default(INCIDENT_LIMITS.defaultStaleAfterSeconds),
  subject: subjectSchema,
  documents: z.array(documentSchema).max(INCIDENT_LIMITS.maxDocuments),
});

export type IncidentRequest = z.infer<typeof incidentRequestSchema>;
export type DocumentInput = z.infer<typeof documentSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;

export class IncidentError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "IncidentError";
    this.code = code;
    this.details = details;
  }
}
