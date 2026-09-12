"use client";

import { fromMicroUsd, type ExposureGroup } from "@/server/research/exposure-map/schema";

function usd(microUsd: number): string {
  return `$${fromMicroUsd(microUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * Grouped exposure, largest first.
 *
 * The share column is explicitly labelled as a share of *known value*, and the
 * caption says that groups overlap, because an asset belongs to both its issuer
 * and its protocol and the column therefore does not sum to 100%.
 */
export function ConcentrationPanel({ groups }: { groups: ExposureGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No holding resolved to a declared issuer, protocol or underlying asset, so there is no shared exposure to report.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Grouped exposure. A holding belongs to every group it depends on, so these totals overlap and do not sum to the
          portfolio value.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Group</th>
            <th scope="col" className="py-2 pr-3">Kind</th>
            <th scope="col" className="py-2 pr-3">Holdings</th>
            <th scope="col" className="py-2 pr-3">Exposure</th>
            <th scope="col" className="py-2 pr-3">Share of known value</th>
            <th scope="col" className="py-2 pr-3">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.nodeId} className="border-b border-white/5 align-top">
              <th scope="row" className="py-2 pr-3 font-medium">
                {group.label}
                <span className="mt-1 block text-xs font-normal text-subtle">{group.network ?? "network unknown"}</span>
              </th>
              <td className="py-2 pr-3 text-xs">{group.kind}</td>
              <td className="py-2 pr-3 text-xs tabular-nums">{group.holdingCount}</td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {usd(group.totalMicroUsd)}
                <span className="block text-subtle">look-through {usd(group.lookThroughMicroUsd)}</span>
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {group.sharePercentOfKnownValue === null ? (
                  <span className="text-subtle">Not derivable</span>
                ) : (
                  `${group.sharePercentOfKnownValue}%`
                )}
              </td>
              <td className="py-2 pr-3 text-xs">
                {group.provenances.length === 0 ? (
                  <span className="text-subtle">None recorded</span>
                ) : (
                  group.provenances.map((provenance) => provenance.replace(/_/g, " ")).join(", ")
                )}
                {group.earliestObservedAt ? (
                  <span className="block text-subtle">
                    observed {group.earliestObservedAt}
                    {group.latestObservedAt && group.latestObservedAt !== group.earliestObservedAt
                      ? ` – ${group.latestObservedAt}`
                      : ""}
                  </span>
                ) : (
                  <span className="block text-subtle">no observation time recorded</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
