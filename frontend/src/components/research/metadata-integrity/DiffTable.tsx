"use client";

import type { ObservationDiff } from "@/server/research/metadata-integrity/schema";

const FIELD_LABELS: Record<ObservationDiff["rows"][number]["field"], string> = {
  name: "Name",
  description: "Description",
  orgUrl: "Official URL",
  image: "Image URL",
  status: "Currency status",
  code: "Asset code",
  issuer: "Issuer",
  homeDomain: "Home domain",
  tomlUrl: "stellar.toml URL",
};

export function DiffTable(props: { diffs: ObservationDiff[] }) {
  if (props.diffs.length === 0) {
    return (
      <section aria-labelledby="diff-heading" data-testid="diff-table">
        <h2 id="diff-heading" className="text-lg font-semibold">
          Field diffs
        </h2>
        <p className="mt-2 text-sm text-muted">No historical drift to compare yet.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="diff-heading" className="flex flex-col gap-4" data-testid="diff-table">
      <h2 id="diff-heading" className="text-lg font-semibold">
        Field diffs
      </h2>
      <p className="text-sm text-muted">
        Each row is an observed change between two snapshots. A change is not automatically fraud.
      </p>

      {props.diffs.map((diff) => (
        <div key={`${diff.fromObservationId}-${diff.toObservationId}`} className="overflow-x-auto">
          <p className="mb-2 text-xs text-subtle">
            {diff.fromObservedAt} → {diff.toObservedAt}
            {" · "}
            changeIsObservationNotFraud={String(diff.changeIsObservationNotFraud)}
          </p>
          <table className="min-w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Metadata field differences from {diff.fromObservedAt} to {diff.toObservedAt}
            </caption>
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
                <th scope="col" className="px-3 py-2 font-medium">
                  Field
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Previous
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Current
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Changed
                </th>
              </tr>
            </thead>
            <tbody>
              {diff.rows.map((row) => (
                <tr key={row.field} className={row.changed ? "bg-[#d9a441]/5" : undefined}>
                  <th scope="row" className="px-3 py-2 font-medium text-muted">
                    {FIELD_LABELS[row.field]}
                  </th>
                  <td className="max-w-[14rem] break-all px-3 py-2 text-xs">{row.previous ?? "—"}</td>
                  <td className="max-w-[14rem] break-all px-3 py-2 text-xs">{row.current ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{row.changed ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
