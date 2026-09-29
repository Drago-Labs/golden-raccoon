/**
 * Surface conflicting status claims without inventing a winner.
 *
 * Missing or contradictory follow-up evidence stays explicit. Official sources
 * that disagree produce `conflicting_official`; a rumor opposing an advisory is
 * `official_vs_unofficial`, not a tie.
 */
import { canSupportOfficialTransition } from "./authority";
import type { Disagreement, DocumentRef } from "./schema";

export function findDisagreements(documents: DocumentRef[]): Disagreement[] {
  const disagreements: Disagreement[] = [];
  const independents = documents.filter((document) => document.role === "independent");

  for (let i = 0; i < independents.length; i += 1) {
    for (let j = i + 1; j < independents.length; j += 1) {
      const left = independents[i];
      const right = independents[j];

      if (left.effectiveStatus === right.effectiveStatus) continue;
      if (left.effectiveStatus === "unknown" || right.effectiveStatus === "unknown") {
        disagreements.push({
          disagreementId: `missing-${left.documentId}-${right.documentId}`,
          leftDocumentId: left.documentId,
          rightDocumentId: right.documentId,
          leftStatus: left.effectiveStatus,
          rightStatus: right.effectiveStatus,
          reason: "missing_follow_up",
          detail: "At least one independent source cannot place the incident status.",
        });
        continue;
      }

      const leftOfficial = canSupportOfficialTransition(left.authority, left.kind);
      const rightOfficial = canSupportOfficialTransition(right.authority, right.kind);

      if (leftOfficial && rightOfficial) {
        disagreements.push({
          disagreementId: `official-${left.documentId}-${right.documentId}`,
          leftDocumentId: left.documentId,
          rightDocumentId: right.documentId,
          leftStatus: left.effectiveStatus,
          rightStatus: right.effectiveStatus,
          reason: "conflicting_official",
          detail: `Independent official sources disagree: ${left.effectiveStatus} vs ${right.effectiveStatus}.`,
        });
        continue;
      }

      if (leftOfficial !== rightOfficial) {
        disagreements.push({
          disagreementId: `mixed-${left.documentId}-${right.documentId}`,
          leftDocumentId: left.documentId,
          rightDocumentId: right.documentId,
          leftStatus: left.effectiveStatus,
          rightStatus: right.effectiveStatus,
          reason: "official_vs_unofficial",
          detail: "An unofficial claim does not override an official advisory, and cannot invent one.",
        });
        continue;
      }

      if (left.stale !== right.stale) {
        disagreements.push({
          disagreementId: `stale-${left.documentId}-${right.documentId}`,
          leftDocumentId: left.documentId,
          rightDocumentId: right.documentId,
          leftStatus: left.effectiveStatus,
          rightStatus: right.effectiveStatus,
          reason: "stale_vs_fresh",
          detail: "A stale update conflicts with a fresher claim; missing follow-up is explicit.",
        });
      }
    }
  }

  // Stale official mitigation with no fresh follow-up is itself unresolved.
  for (const document of independents) {
    if (
      document.stale &&
      (document.effectiveStatus === "mitigated" || document.effectiveStatus === "acknowledged") &&
      canSupportOfficialTransition(document.authority, document.kind)
    ) {
      const fresher = independents.some(
        (candidate) =>
          !candidate.stale &&
          candidate.documentId !== document.documentId &&
          candidate.effectiveStatus !== document.effectiveStatus,
      );
      if (!fresher) {
        disagreements.push({
          disagreementId: `stale-followup-${document.documentId}`,
          leftDocumentId: document.documentId,
          rightDocumentId: document.documentId,
          leftStatus: document.effectiveStatus,
          rightStatus: document.effectiveStatus,
          reason: "missing_follow_up",
          detail: "The latest official claim is stale and no fresher follow-up evidence was supplied.",
        });
      }
    }
  }

  return disagreements;
}
