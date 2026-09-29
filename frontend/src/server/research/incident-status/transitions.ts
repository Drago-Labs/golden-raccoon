/**
 * Build a source-linked status timeline and transition list.
 *
 * Transitions record which documents support each status step. A step is
 * `officiallySupported` only when an independent official source backs it.
 */
import { canSupportOfficialTransition } from "./authority";
import type { ClaimedStatus, DocumentRef, StatusTransition, TimelineEntry } from "./schema";

function eventTime(document: DocumentRef): number | null {
  const stamp = document.updatedAt ?? document.publishedAt;
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isFinite(ms) ? ms : null;
}

export function buildTimeline(documents: DocumentRef[]): TimelineEntry[] {
  const entries: TimelineEntry[] = documents.map((document) => {
    const updated = document.updatedAt ? Date.parse(document.updatedAt) : NaN;
    const published = document.publishedAt ? Date.parse(document.publishedAt) : NaN;
    let kind: TimelineEntry["kind"] = "unknown";
    let at: string | null = null;

    if (Number.isFinite(updated)) {
      kind = "updated";
      at = document.updatedAt;
    } else if (Number.isFinite(published)) {
      kind = "published";
      at = document.publishedAt;
    }

    return {
      documentId: document.documentId,
      at,
      kind,
      effectiveStatus: document.effectiveStatus,
      authority: document.authority,
      title: document.title,
      note: document.statusReason,
    };
  });

  return entries.sort((left, right) => {
    if (left.at === null && right.at === null) return left.documentId.localeCompare(right.documentId);
    if (left.at === null) return 1;
    if (right.at === null) return -1;
    return Date.parse(left.at) - Date.parse(right.at);
  });
}

export function buildTransitions(documents: DocumentRef[]): StatusTransition[] {
  const ordered = [...documents].sort((left, right) => {
    const leftAt = eventTime(left);
    const rightAt = eventTime(right);
    if (leftAt === null && rightAt === null) return left.documentId.localeCompare(right.documentId);
    if (leftAt === null) return 1;
    if (rightAt === null) return -1;
    return leftAt - rightAt;
  });

  const transitions: StatusTransition[] = [];
  let previous: ClaimedStatus | null = null;

  for (const document of ordered) {
    if (document.effectiveStatus === previous) continue;

    const peers = ordered.filter(
      (candidate) =>
        candidate.effectiveStatus === document.effectiveStatus &&
        (eventTime(candidate) === null ||
          eventTime(document) === null ||
          Math.abs((eventTime(candidate) ?? 0) - (eventTime(document) ?? 0)) < 86_400_000),
    );

    const supporting = peers.length > 0 ? peers : [document];
    const officiallySupported = supporting.some(
      (entry) => entry.role === "independent" && canSupportOfficialTransition(entry.authority, entry.kind),
    );

    transitions.push({
      transitionId: `transition-${transitions.length + 1}-${document.effectiveStatus}`,
      fromStatus: previous,
      toStatus: document.effectiveStatus,
      at: document.updatedAt ?? document.publishedAt,
      supportingDocumentIds: supporting.map((entry) => entry.documentId),
      officiallySupported,
      note: officiallySupported
        ? `Independent official source supports the move to ${document.effectiveStatus}.`
        : `Status moved to ${document.effectiveStatus} without independent official support.`,
    });

    previous = document.effectiveStatus;
  }

  return transitions;
}
