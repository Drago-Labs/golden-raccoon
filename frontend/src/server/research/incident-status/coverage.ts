/**
 * Coverage summary for an incident-status report.
 */
import { canSupportOfficialTransition } from "./authority";
import type { Disagreement, DocumentRef, IncidentCoverage } from "./schema";

export function buildCoverage(documents: DocumentRef[], disagreements: Disagreement[]): IncidentCoverage {
  if (documents.length === 0) {
    return {
      state: "empty",
      documentCount: 0,
      independentOfficialCount: 0,
      syndicatedCopyCount: 0,
      rumorCount: 0,
      staleCount: 0,
      disagreementCount: 0,
      unresolvedClaimCount: 0,
      note: "No incident documents were supplied, so there is no status evidence to read.",
    };
  }

  const independentOfficialCount = documents.filter(
    (document) => document.role === "independent" && canSupportOfficialTransition(document.authority, document.kind),
  ).length;
  const syndicatedCopyCount = documents.filter((document) => document.role === "syndicated_copy").length;
  const rumorCount = documents.filter((document) => document.kind === "rumor").length;
  const staleCount = documents.filter((document) => document.stale).length;
  const unresolvedClaimCount = documents.filter(
    (document) =>
      document.effectiveStatus === "unknown" ||
      document.effectiveStatus === "reported" ||
      document.effectiveStatus === "reopened" ||
      (document.role === "independent" && document.authority !== "official" && document.claimedStatus !== document.effectiveStatus),
  ).length;

  const hasOfficialConflict = disagreements.some((entry) => entry.reason === "conflicting_official");
  const hasGaps =
    disagreements.some((entry) => entry.reason === "missing_follow_up" || entry.reason === "stale_vs_fresh") ||
    staleCount > 0 ||
    independentOfficialCount === 0;

  let state: IncidentCoverage["state"] = "complete";
  if (hasOfficialConflict) state = "disputed";
  else if (hasGaps) state = "partial";

  const reasons: string[] = [];
  if (independentOfficialCount === 0) reasons.push("no independent official advisory");
  if (syndicatedCopyCount > 0) reasons.push(`${syndicatedCopyCount} syndicated cop${syndicatedCopyCount === 1 ? "y" : "ies"}`);
  if (rumorCount > 0) reasons.push(`${rumorCount} rumor${rumorCount === 1 ? "" : "s"}`);
  if (staleCount > 0) reasons.push(`${staleCount} stale update${staleCount === 1 ? "" : "s"}`);
  if (disagreements.length > 0) reasons.push(`${disagreements.length} disagreement${disagreements.length === 1 ? "" : "s"}`);

  return {
    state,
    documentCount: documents.length,
    independentOfficialCount,
    syndicatedCopyCount,
    rumorCount,
    staleCount,
    disagreementCount: disagreements.length,
    unresolvedClaimCount,
    note:
      reasons.length === 0
        ? `All ${documents.length} documents read cleanly with independent official support.`
        : `Read this chronology as ${state}: ${reasons.join("; ")}. Status labels remain source claims, not ground truth.`,
  };
}
