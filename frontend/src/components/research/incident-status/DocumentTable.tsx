"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { DocumentRef } from "@/server/research/incident-status/schema";

const statusTone: Record<DocumentRef["effectiveStatus"], "success" | "warning" | "danger" | "neutral"> = {
  reported: "warning",
  acknowledged: "neutral",
  mitigated: "success",
  reopened: "danger",
  unknown: "neutral",
};

/**
 * Document evidence table.
 *
 * Effective status is shown beside claimed status so a reader can see when a
 * rumor was kept as reported rather than promoted to acknowledgement.
 */
export function DocumentTable({
  documents,
  selectedDocumentId,
  onSelect,
}: {
  documents: DocumentRef[];
  selectedDocumentId: string | null;
  onSelect: (documentId: string) => void;
}) {
  if (documents.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No documents were supplied for this subject.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Incident documents. Effective status applies authority rules; rumours cannot become acknowledgements.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Document</th>
            <th scope="col" className="py-2 pr-3">Kind</th>
            <th scope="col" className="py-2 pr-3">Authority</th>
            <th scope="col" className="py-2 pr-3">Claimed</th>
            <th scope="col" className="py-2 pr-3">Effective</th>
            <th scope="col" className="py-2 pr-3">Provenance</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => {
            const selected = document.documentId === selectedDocumentId;

            return (
              <tr
                key={document.documentId}
                className={selected ? "bg-white/5" : undefined}
                data-testid={`document-row-${document.documentId}`}
              >
                <th scope="row" className="py-3 pr-3 align-top font-medium">
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    aria-pressed={selected}
                    onClick={() => onSelect(document.documentId)}
                  >
                    {document.title}
                  </button>
                  <p className="mt-1 text-xs font-normal text-subtle">{document.domain}</p>
                  {document.stale ? (
                    <p className="mt-1 text-xs font-normal text-amber-200/90" data-testid={`stale-${document.documentId}`}>
                      Stale: {document.staleReason}
                    </p>
                  ) : null}
                </th>
                <td className="py-3 pr-3 align-top text-xs">{document.kind.replaceAll("_", " ")}</td>
                <td className="py-3 pr-3 align-top text-xs">{document.authority}</td>
                <td className="py-3 pr-3 align-top text-xs">{document.claimedStatus}</td>
                <td className="py-3 pr-3 align-top">
                  <StatusBadge tone={statusTone[document.effectiveStatus]}>{document.effectiveStatus}</StatusBadge>
                  <p className="mt-1 max-w-[16rem] text-xs text-subtle">{document.statusReason}</p>
                </td>
                <td className="py-3 pr-3 align-top text-xs">
                  {document.role.replaceAll("_", " ")}
                  <p className="mt-1 max-w-[14rem] text-subtle">{document.roleReason}</p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
