/**
 * Versioned contract for the policy-change tracker.
 *
 * The line this feature refuses to cross: **a changed paragraph is a
 * recorded difference, not a legal opinion.** This tool never says a change
 * is good, bad, or deceptive — only that the text at a URL differs from a
 * prior snapshot, with evidence.
 */
import { z } from "zod";

export const POLICY_CHANGE_SCHEMA_VERSION = "policy-changes/2026-01" as const;

export type PageFetchOutcome =
  | "ok"
  | "redirect_blocked"
  | "private_or_local_target"
  | "oversized"
  | "timeout"
  | "http_error"
  | "dns_failure"
  | "unsupported_content_type";

export type PolicyFetchEvidence = {
  requestedUrl: string;
  finalUrl: string | null;
  outcome: PageFetchOutcome;
  httpStatus: number | null;
  redirectChain: string[];
  contentType: string | null;
  byteLength: number | null;
  fetchedAt: string;
  issues: string[];
};

export type PolicySnapshot = {
  snapshotId: string;
  projectId: string;
  fetchedAt: string;
  /** SHA-256 of the extracted, normalized text. */
  contentHash: string;
  /** Bounded excerpt of the extracted text, for display only. */
  textExcerpt: string;
  fullTextLength: number;
  fetch: PolicyFetchEvidence;
};

export type DiffUnit = "paragraph" | "sentence";

export type SnapshotDiffRow = {
  unit: DiffUnit;
  index: number;
  previousText: string | null;
  currentText: string | null;
  changed: boolean;
};

export type SnapshotDiff = {
  fromSnapshotId: string;
  toSnapshotId: string;
  fromFetchedAt: string;
  toFetchedAt: string;
  contentUnchanged: boolean;
  rows: SnapshotDiffRow[];
};

export type FigureChange = {
  /** A short window of surrounding text so the figure is identifiable. */
  context: string;
  previousValue: string | null;
  currentValue: string | null;
};

export type PolicyChangeReport = {
  schemaVersion: typeof POLICY_CHANGE_SCHEMA_VERSION;
  evaluatedAt: string;
  projectId: string;
  projectLabel: string;
  policyUrl: string;
  currentSnapshot: PolicySnapshot;
  timeline: PolicySnapshot[];
  diffs: SnapshotDiff[];
  figureChanges: FigureChange[];
  coverage: {
    state: "complete" | "partial" | "empty" | "unavailable";
    note: string;
  };
  /** Hard-coded so no code path can invent a legal judgment. */
  legalOpinion: null;
  changeIsObservationNotJudgment: true;
  readOnly: true;
};

export const priorSnapshotSchema = z.object({
  snapshotId: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64),
  fetchedAt: z.string().datetime(),
  contentHash: z.string().min(8).max(128),
  textExcerpt: z.string().max(4_096),
  fullTextLength: z.number().int().min(0),
  fetch: z.object({
    requestedUrl: z.string().max(2_048),
    finalUrl: z.string().max(2_048).nullable(),
    outcome: z.enum([
      "ok",
      "redirect_blocked",
      "private_or_local_target",
      "oversized",
      "timeout",
      "http_error",
      "dns_failure",
      "unsupported_content_type",
    ]),
    httpStatus: z.number().int().nullable(),
    redirectChain: z.array(z.string().max(2_048)).max(10),
    contentType: z.string().max(256).nullable(),
    byteLength: z.number().int().nullable(),
    fetchedAt: z.string().datetime(),
    issues: z.array(z.string().max(512)).max(16),
  }),
});

export const policyChangeRequestSchema = z.object({
  projectId: z.string().min(1).max(64),
  evaluatedAt: z.string().datetime().optional(),
  priorSnapshots: z.array(priorSnapshotSchema).max(50).optional(),
});

export type PolicyChangeRequest = z.infer<typeof policyChangeRequestSchema>;

export type PageFetchResult = {
  outcome: PageFetchOutcome;
  requestedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  redirectChain: string[];
  contentType: string | null;
  byteLength: number | null;
  body: string | null;
  issues: string[];
};

export type PageFetcher = (input: { url: string }) => Promise<PageFetchResult>;
