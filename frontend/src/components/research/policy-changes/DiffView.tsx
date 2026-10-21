"use client";

import type { SnapshotDiff } from "@/server/research/policy-changes/schema";

export function DiffView({ diffs }: { diffs: SnapshotDiff[] }) {
  if (diffs.length === 0) {
    return (
      <section aria-labelledby="diff-view-heading" data-testid="diff-view">
        <h2 id="diff-view-heading" className="text-lg font-semibold">
          Text diff
        </h2>
        <p className="mt-2 text-sm text-muted">No historical drift to compare yet.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="diff-view-heading" className="flex flex-col gap-4" data-testid="diff-view">
      <h2 id="diff-view-heading" className="text-lg font-semibold">
        Text diff
      </h2>
      <p className="text-sm text-muted">Each row is a recorded difference, not a legal opinion about what it means.</p>

      {diffs.map((diff) => (
        <div key={`${diff.fromSnapshotId}-${diff.toSnapshotId}`} className="overflow-x-auto">
          <p className="mb-2 text-xs text-subtle">
            {diff.fromFetchedAt} → {diff.toFetchedAt}
            {diff.contentUnchanged ? " · unchanged" : ` · ${diff.rows.length} row(s) differ`}
          </p>
          {diff.contentUnchanged ? null : (
            <table className="min-w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Policy text differences from {diff.fromFetchedAt} to {diff.toFetchedAt}
              </caption>
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Unit
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Previous
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Current
                  </th>
                </tr>
              </thead>
              <tbody>
                {diff.rows
                  .filter((row) => row.changed)
                  .map((row, rowIndex) => (
                    <tr key={`${row.unit}-${row.index}-${rowIndex}`} className="bg-[#d9a441]/5">
                      <th scope="row" className="px-3 py-2 font-medium text-muted">
                        {row.unit}
                      </th>
                      <td className="max-w-[20rem] break-words px-3 py-2 text-xs">{row.previousText ?? "—"}</td>
                      <td className="max-w-[20rem] break-words px-3 py-2 text-xs">{row.currentText ?? "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </section>
  );
}
