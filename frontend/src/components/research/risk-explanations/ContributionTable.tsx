"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ExplanationContribution } from "@/server/research/risk-explanations/schema";

const evidenceTone = {
  resolved: "success",
  ambiguous: "warning",
  label_only: "warning",
  unlinked: "neutral",
} as const;

const evidenceLabel = {
  resolved: "Source linked",
  ambiguous: "Ambiguous source",
  label_only: "Label only",
  unlinked: "No source named",
} as const;

/**
 * Tabular view of every contribution.
 *
 * Scored and descriptive rows are labelled rather than merged, and a row whose
 * impact is `null` renders an explicit "not recorded" cell so an empty column
 * can never be read as a zero contribution.
 */
export function ContributionTable({
  contributions,
  selectedKey,
  onSelect,
  caption,
}: {
  contributions: ExplanationContribution[];
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  caption: string;
}) {
  if (contributions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No contribution matches the active filter. Critical blockers stay listed above regardless of filtering.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Factor</th>
            <th scope="col" className="py-2 pr-3">Agent</th>
            <th scope="col" className="py-2 pr-3">Category</th>
            <th scope="col" className="py-2 pr-3">Kind</th>
            <th scope="col" className="py-2 pr-3">Recorded impact</th>
            <th scope="col" className="py-2 pr-3">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {contributions.map((contribution) => (
            <tr
              key={contribution.key}
              data-contribution-key={contribution.key}
              aria-selected={contribution.key === selectedKey}
              className={`border-b border-white/5 align-top ${contribution.key === selectedKey ? "bg-white/5" : ""}`}
            >
              <th scope="row" className="py-2 pr-3 font-medium">
                <button
                  type="button"
                  onClick={() => onSelect?.(contribution.key)}
                  className="text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
                >
                  {contribution.label}
                </button>
                {contribution.critical ? (
                  <span className="ml-2 rounded border border-red-300/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-200">
                    Critical
                  </span>
                ) : null}
                <span className="mt-1 block text-xs font-normal text-subtle">{contribution.detail}</span>
              </th>
              <td className="py-2 pr-3 text-xs">
                {contribution.agentDisplayName}
                <span className="block font-mono text-[11px] text-subtle">{contribution.agent}</span>
              </td>
              <td className="py-2 pr-3 text-xs">{contribution.category}</td>
              <td className="py-2 pr-3 text-xs">
                {contribution.kind === "scored" ? "Scored" : "Descriptive"}
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {contribution.impact === null ? (
                  <span className="text-subtle">Not recorded</span>
                ) : (
                  <>
                    {contribution.impact}
                    <span className="block text-[11px] text-subtle">
                      {contribution.direction.replace(/_/g, " ")}
                      {contribution.weight === null ? " · no weight" : ` · weight ${contribution.weight}`}
                    </span>
                  </>
                )}
              </td>
              <td className="py-2 pr-3 text-xs">
                <StatusBadge tone={evidenceTone[contribution.evidence.state]}>
                  {evidenceLabel[contribution.evidence.state]}
                </StatusBadge>
                {contribution.evidence.claimedLabel ? (
                  <span className="mt-1 block text-[11px] text-subtle">{contribution.evidence.claimedLabel}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
