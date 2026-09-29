/**
 * Versioned contract for the channel-continuity inspector.
 *
 * The line this feature refuses to cross: it reports **observed channel
 * changes as evidence**, never as proof of takeover or fraud. A ticker match
 * or shared branding never makes a channel "official". Same-symbol tokens stay
 * separate through canonical subject identity, and lookalike domains never
 * collapse into one another.
 */
import { z } from "zod";

export const CONTINUITY_SCHEMA_VERSION = "channel-continuity/2026-01" as const;

export const CONTINUITY_LIMITS = {
  maxSubjects: 40,
  maxObservations: 2_000,
  maxRedirectHops: 5,
  maxCrossLinks: 40,
  maxSnapshotLength: 2_000,
  maxRequestBytes: 2_097_152,
} as const;

export type ChannelKind = "website" | "twitter" | "telegram" | "discord" | "github" | "other";

/**
 * How the caller obtained the claim. Only `canonical_reference` is treated as
 * project-declared; ticker/branding matches stay `ambiguous` or `user_supplied`.
 */
export type ClaimKind = "canonical_reference" | "user_supplied" | "ambiguous";

export type FetchOutcome =
  | "ok"
  | "redirected"
  | "broken"
  | "blocked_unsafe"
  | "missing_archive"
  | "source_failed"
  | "not_fetched";

export type ContinuityEventKind =
  | "redirect"
  | "handle_change"
  | "display_name_change"
  | "domain_change"
  | "broken_link"
  | "cross_link_change"
  | "source_failure"
  | "missing_archive"
  | "blocked_unsafe";

export type ContinuitySubject = {
  subjectId: string;
  /** Stable identity: chain + symbol + issuer/contract. Same ticker, different issuer → different key. */
  identityKey: string;
  chainId: string;
  symbol: string;
  issuer: string | null;
  contractAddress: string | null;
};

export type UrlSafetySummary = {
  safe: boolean;
  hostname: string | null;
  normalizedUrl: string | null;
  issues: string[];
};

export type ChannelObservation = {
  observationId: string;
  subjectId: string;
  identityKey: string;
  channelKind: ChannelKind;
  /** Distinguishes multiple channels of the same kind on one subject. */
  channelKey: string;
  observedAt: string | null;
  url: string | null;
  handle: string | null;
  displayName: string | null;
  claimKind: ClaimKind;
  sourceLabel: string;
  /** Sanitized snapshot excerpt; never markup. */
  sourceSnapshot: string | null;
  redirectChain: string[];
  fetchOutcome: FetchOutcome;
  crossLinks: string[];
  urlSafety: UrlSafetySummary;
  /** Set when this observation cannot take part in continuity diffs. */
  excludedReason: string | null;
};

export type ContinuityEvent = {
  eventId: string;
  kind: ContinuityEventKind;
  subjectId: string;
  identityKey: string;
  channelKind: ChannelKind;
  channelKey: string;
  observedAt: string | null;
  fromObservationId: string | null;
  toObservationId: string;
  /** Plain statement of what changed. */
  detail: string;
  /** What the change does *not* establish. */
  limitation: string;
};

export type TimelineEntry = {
  observedAt: string | null;
  observationIds: string[];
  eventIds: string[];
  note: string;
};

export type CrossLinkEdge = {
  edgeId: string;
  subjectId: string;
  identityKey: string;
  fromObservationId: string;
  fromUrl: string | null;
  toUrl: string;
  toHostname: string | null;
  /** True when the target URL fails URL-safety checks. */
  blocked: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  observationCount: number;
};

export type SourceCoverageRow = {
  sourceLabel: string;
  observationCount: number;
  subjectCount: number;
  failedCount: number;
  missingArchiveCount: number;
  blockedUnsafeCount: number;
  canonicalReferenceCount: number;
  userSuppliedCount: number;
  ambiguousCount: number;
};

export type ContinuityCoverage = {
  state: "complete" | "partial" | "insufficient" | "empty";
  subjectCount: number;
  observationCount: number;
  analysableCount: number;
  eventCount: number;
  undatedCount: number;
  blockedUnsafeCount: number;
  note: string;
};

export type ContinuityFinding = {
  findingId: string;
  kind: ContinuityEventKind | "identity_uncertainty" | "insufficient_evidence";
  /** Evidence only — never a verdict of takeover or fraud. */
  strength: "observed" | "insufficient_evidence";
  measurement: string;
  supportingObservationIds: string[];
  limitation: string;
};

export type ContinuityReport = {
  schemaVersion: typeof CONTINUITY_SCHEMA_VERSION;
  observedAt: string;
  subjects: ContinuitySubject[];
  observations: ChannelObservation[];
  events: ContinuityEvent[];
  timeline: TimelineEntry[];
  crossLinks: CrossLinkEdge[];
  sourceCoverage: SourceCoverageRow[];
  findings: ContinuityFinding[];
  coverage: ContinuityCoverage;
  /** This feature changes no social score or recommendation. */
  scoreUnchanged: true;
};

const subjectSchema = z.object({
  subjectId: z.string().trim().min(1).max(120),
  chainId: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(64),
  issuer: z.string().trim().max(120).optional(),
  contractAddress: z.string().trim().max(120).optional(),
});

const observationSchema = z.object({
  observationId: z.string().trim().min(1).max(160),
  subjectId: z.string().trim().min(1).max(120),
  channelKind: z.enum(["website", "twitter", "telegram", "discord", "github", "other"]),
  channelKey: z.string().trim().min(1).max(120).optional(),
  observedAt: z.string().datetime({ offset: true }).optional(),
  url: z.string().max(2_000).optional(),
  handle: z.string().max(200).optional(),
  displayName: z.string().max(200).optional(),
  claimKind: z.enum(["canonical_reference", "user_supplied", "ambiguous"]).default("ambiguous"),
  sourceLabel: z.string().trim().min(1).max(160),
  sourceSnapshot: z.string().max(CONTINUITY_LIMITS.maxSnapshotLength).optional(),
  redirectChain: z.array(z.string().max(2_000)).max(CONTINUITY_LIMITS.maxRedirectHops).optional(),
  fetchOutcome: z
    .enum(["ok", "redirected", "broken", "blocked_unsafe", "missing_archive", "source_failed", "not_fetched"])
    .optional(),
  crossLinks: z.array(z.string().max(2_000)).max(CONTINUITY_LIMITS.maxCrossLinks).optional(),
});

export const continuityRequestSchema = z.object({
  observedAt: z.string().datetime({ offset: true }),
  subjects: z.array(subjectSchema).max(CONTINUITY_LIMITS.maxSubjects),
  observations: z.array(observationSchema).max(CONTINUITY_LIMITS.maxObservations),
});

export type ContinuityRequest = z.infer<typeof continuityRequestSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;
export type ObservationInput = z.infer<typeof observationSchema>;

export class ContinuityError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ContinuityError";
    this.code = code;
    this.details = details;
  }
}
