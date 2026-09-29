"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { Disagreement, DocumentRef } from "@/server/research/incident-status/schema";

const reasonLabel: Record<Disagreement["reason"], string> = {
  conflicting_official: "Conflicting official sources",
  official_vs_unofficial: "Official vs unofficial",
  stale_vs_fresh: "Stale vs fresh",
  missing_follow_up: "Missing follow-up",
};

/**
 * Disagreement panel. Does not pick a winner; missing follow-up stays explicit.
 */
export function DisagreementPanel({
  disagreements,
  documents,
}: {
  disagreements: Disagreement[];
  documents: DocumentRef[];
}) {
  const byId = new Map(documents.map((document) => [document.documentId, document]));

  if (disagreements.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle" data-testid="disagreements">
        No disagreements were recorded among independent sources.
      </p>
    );
  }

  return (
    <ul className="space-y-3" data-testid="disagreements">
      {disagreements.map((entry) => {
        const left = byId.get(entry.leftDocumentId);
        const right = byId.get(entry.rightDocumentId);

        return (
          <li key={entry.disagreementId} className="rounded-xl border border-white/10 px-4 py-3">
            <StatusBadge tone="danger">{reasonLabel[entry.reason]}</StatusBadge>
            <p className="mt-2 text-sm">{entry.detail}</p>
            <p className="mt-2 text-xs text-subtle">
              {left?.title ?? entry.leftDocumentId} ({entry.leftStatus})
              {entry.leftDocumentId !== entry.rightDocumentId
                ? ` vs ${right?.title ?? entry.rightDocumentId} (${entry.rightStatus})`
                : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
