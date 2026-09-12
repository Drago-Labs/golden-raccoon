"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ChangeStatus, FactorChange } from "@/server/research/report-comparison/schema";

const statusLabel: Record<ChangeStatus, string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "Unchanged",
  ambiguous: "Ambiguous match",
};

const statusTone: Record<ChangeStatus, "success" | "warning" | "danger" | "neutral"> = {
  added: "danger",
  removed: "warning",
  changed: "warning",
  unchanged: "neutral",
  ambiguous: "warning",
};

/**
 * Narrative differences: top reasons and missing-data markers.
 *
 * A removed reason is toned as a caveat rather than a success, because the
 * snapshot format cannot tell us whether it was resolved or merely dropped.
 */
export function FactorChanges({
  factors,
  leftLabel,
  rightLabel,
  showUnchanged,
}: {
  factors: FactorChange[];
  leftLabel: string;
  rightLabel: string;
  showUnchanged: boolean;
}) {
  const visible = showUnchanged ? factors : factors.filter((factor) => factor.status !== "unchanged");

  if (visible.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        {factors.length === 0
          ? "Neither snapshot carries a narrative item to compare."
          : "No narrative item differs between the two observations."}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {visible.map((factor) => (
        <li key={factor.key} className="rounded-xl border border-white/10 p-3 text-sm">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={statusTone[factor.status]}>{statusLabel[factor.status]}</StatusBadge>
            <span className="text-xs uppercase tracking-wide text-subtle">
              {factor.kind === "top_reason" ? "Top reason" : "Missing data"}
            </span>
          </span>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-subtle">{leftLabel}</dt>
              <dd className="text-sm">{factor.leftText ?? <span className="text-subtle">Not present</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">{rightLabel}</dt>
              <dd className="text-sm">{factor.rightText ?? <span className="text-subtle">Not present</span>}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-subtle">{factor.note}</p>
          {factor.candidates && factor.candidates.length > 0 ? (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-subtle">Candidates that share this fingerprint</summary>
              <ul className="mt-1 list-disc pl-5 text-subtle">
                {factor.candidates.map((candidate, index) => (
                  <li key={`${factor.key}-${index}`}>{candidate}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
