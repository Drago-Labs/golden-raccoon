/**
 * Public entry point for the policy-change tracker.
 *
 * Fetches a registry-listed project's policy page, extracts readable text,
 * content-hashes it, and diffs it against caller-supplied prior snapshots.
 * It never stores anything server-side, never renders raw HTML, and never
 * offers a legal opinion on what a change means.
 */
import { detectFigureChanges } from "./figureChanges";
import { buildTimelineDiffs, sortTimeline } from "./diff";
import { hashContent, snapshotIdFor } from "./contentHash";
import { PolicyChangeError } from "./errors";
import { findPolicyProject } from "./projectRegistry";
import { safeExcerpt } from "./safeContent";
import { appendSnapshot, filterPriorForProject } from "./snapshotStore";
import { extractReadableText } from "./textExtraction";
import {
  POLICY_CHANGE_SCHEMA_VERSION,
  policyChangeRequestSchema,
  type PageFetcher,
  type PolicyChangeReport,
  type PolicyFetchEvidence,
  type PolicySnapshot,
} from "./schema";

export async function trackPolicyChanges(
  input: unknown,
  deps: { fetchPage: PageFetcher },
): Promise<PolicyChangeReport> {
  const parsed = policyChangeRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new PolicyChangeError("invalid_request", "The policy-change request could not be read.", parsed.error.flatten());
  }

  const project = findPolicyProject(parsed.data.projectId);
  if (!project) {
    throw new PolicyChangeError("unknown_project", "That project is not in this tool's registry.");
  }

  const evaluatedAt = parsed.data.evaluatedAt ? new Date(Date.parse(parsed.data.evaluatedAt)).toISOString() : new Date().toISOString();
  const prior = filterPriorForProject(parsed.data.priorSnapshots ?? [], project.id);

  const fetched = await deps.fetchPage({ url: project.url });
  const fetchEvidence: PolicyFetchEvidence = {
    requestedUrl: fetched.requestedUrl,
    finalUrl: fetched.finalUrl,
    outcome: fetched.outcome,
    httpStatus: fetched.httpStatus,
    redirectChain: fetched.redirectChain,
    contentType: fetched.contentType,
    byteLength: fetched.byteLength,
    fetchedAt: evaluatedAt,
    issues: fetched.issues,
  };

  const latestPrior = prior.at(-1) ?? null;

  if (fetched.outcome !== "ok" || !fetched.body) {
    // A fetch failure is recorded as a gap, not a removal: the existing
    // timeline is returned unchanged, and the failed attempt is visible only
    // in `currentSnapshot.fetch` and `coverage`.
    const gapSnapshot: PolicySnapshot = {
      snapshotId: snapshotIdFor(project.id, evaluatedAt, "unavailable"),
      projectId: project.id,
      fetchedAt: evaluatedAt,
      contentHash: "unavailable",
      textExcerpt: "",
      fullTextLength: 0,
      fetch: fetchEvidence,
    };

    return {
      schemaVersion: POLICY_CHANGE_SCHEMA_VERSION,
      evaluatedAt,
      projectId: project.id,
      projectLabel: project.label,
      policyUrl: project.url,
      currentSnapshot: gapSnapshot,
      timeline: sortTimeline(prior),
      diffs: buildTimelineDiffs(sortTimeline(prior), new Map()),
      figureChanges: [],
      coverage: {
        state: prior.length > 0 ? "partial" : "unavailable",
        note:
          prior.length > 0
            ? "This fetch failed; the prior snapshot history is shown without a new data point."
            : "This fetch failed and no prior snapshot history exists for this project yet.",
      },
      legalOpinion: null,
      changeIsObservationNotJudgment: true,
      readOnly: true,
    };
  }

  const text = extractReadableText(fetched.body, fetched.contentType);
  const contentHash = hashContent(text);

  let currentSnapshot: PolicySnapshot;
  let timeline: PolicySnapshot[];

  if (latestPrior && latestPrior.contentHash === contentHash) {
    // Unchanged content creates no new version.
    currentSnapshot = latestPrior;
    timeline = sortTimeline(prior);
  } else {
    currentSnapshot = {
      snapshotId: snapshotIdFor(project.id, evaluatedAt, contentHash),
      projectId: project.id,
      fetchedAt: evaluatedAt,
      contentHash,
      textExcerpt: safeExcerpt(text),
      fullTextLength: text.length,
      fetch: fetchEvidence,
    };
    timeline = appendSnapshot(prior, currentSnapshot);
  }

  const textBySnapshotId = new Map<string, string>();
  for (const snapshot of timeline) {
    textBySnapshotId.set(snapshot.snapshotId, snapshot.snapshotId === currentSnapshot.snapshotId ? text : snapshot.textExcerpt);
  }

  const diffs = buildTimelineDiffs(timeline, textBySnapshotId);
  const lastDiff = diffs.at(-1);
  const figureChanges = lastDiff ? detectFigureChanges(lastDiff.rows) : [];

  return {
    schemaVersion: POLICY_CHANGE_SCHEMA_VERSION,
    evaluatedAt,
    projectId: project.id,
    projectLabel: project.label,
    policyUrl: project.url,
    currentSnapshot,
    timeline,
    diffs,
    figureChanges,
    coverage: { state: "complete", note: "The policy page was fetched and compared against its known history." },
    legalOpinion: null,
    changeIsObservationNotJudgment: true,
    readOnly: true,
  };
}
