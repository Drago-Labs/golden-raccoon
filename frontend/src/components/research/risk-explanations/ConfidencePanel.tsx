"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ConfidenceGap, ExplanationCoverage, ScoreReconciliation } from "@/server/research/risk-explanations/schema";

const gapTone = { high: "danger", medium: "warning", low: "neutral" } as const;

/**
 * Shows what the report could and could not explain.
 *
 * Every number here is accompanied by the qualifier that produced it, so a
 * reader never sees a reconstructed score without the sentence saying whether
 * the scoring model permits that reconstruction at all.
 */
export function ConfidencePanel({
  reconciliation,
  gaps,
  coverage,
  contradictions,
}: {
  reconciliation: ScoreReconciliation;
  gaps: ConfidenceGap[];
  coverage: ExplanationCoverage;
  contradictions: string[];
}) {
  return (
    <section aria-labelledby="explanation-confidence-heading" className="space-y-4">
      <h3 id="explanation-confidence-heading" className="text-sm font-semibold">
        Score reconciliation and declared gaps
      </h3>

      <div className="rounded-xl border border-white/10 p-4">
        <p className="text-sm">
          Reported buy risk <strong className="tabular-nums">{reconciliation.reportedBuyRisk}/100</strong>.{" "}
          {reconciliation.model === "additive" ? (
            <>Attributed <strong className="tabular-nums">{reconciliation.attributedBuyRisk}</strong>.</>
          ) : (
            <>No exact decomposition is available for this report.</>
          )}
        </p>
        <ul className="mt-2 space-y-1 text-xs text-subtle">
          {reconciliation.qualifiers.map((qualifier) => (
            <li key={qualifier}>{qualifier}</li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <caption className="sr-only">Per-agent reconciliation of recorded factor impacts against the reported agent score</caption>
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
              <th scope="col" className="py-2 pr-3">Agent</th>
              <th scope="col" className="py-2 pr-3">Model</th>
              <th scope="col" className="py-2 pr-3">Reported</th>
              <th scope="col" className="py-2 pr-3">Attributed</th>
              <th scope="col" className="py-2 pr-3">Unexplained</th>
            </tr>
          </thead>
          <tbody>
            {reconciliation.perAgent.map((agent) => (
              <tr key={agent.agent} className="border-b border-white/5 align-top">
                <th scope="row" className="py-2 pr-3 font-medium">
                  {agent.agentDisplayName}
                  <span className="mt-1 block text-xs font-normal text-subtle">
                    {agent.scoredFactorCount} scored · {agent.descriptiveFactorCount} descriptive
                  </span>
                </th>
                <td className="py-2 pr-3 text-xs">
                  <StatusBadge tone={agent.model === "additive" ? "success" : "warning"}>
                    {agent.model === "additive" ? "Additive" : agent.model === "unavailable" ? "No scored factors" : "Not additive"}
                  </StatusBadge>
                </td>
                <td className="py-2 pr-3 text-xs tabular-nums">{agent.reportedScore}</td>
                <td className="py-2 pr-3 text-xs tabular-nums">
                  {agent.attributedScore === null ? <span className="text-subtle">Not derivable</span> : agent.attributedScore}
                </td>
                <td className="py-2 pr-3 text-xs tabular-nums">
                  {agent.unexplainedRemainder === null ? (
                    <span className="text-subtle">Whole score</span>
                  ) : (
                    agent.unexplainedRemainder
                  )}
                  <span className="mt-1 block text-[11px] font-normal text-subtle">{agent.qualifiers.join(" ")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {contradictions.length > 0 ? (
        <p className="rounded-xl border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-3 text-xs text-[#f2c86d]">
          {contradictions.length} factor{contradictions.length === 1 ? "" : "s"} declare a direction that contradicts the sign of
          their recorded impact. They are listed as reported and excluded from any reconstruction.
        </p>
      ) : null}

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">Declared gaps ({gaps.length})</h4>
        {gaps.length === 0 ? (
          <p className="mt-2 text-xs text-subtle">The report declared no missing evidence.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {gaps.map((gap) => (
              <li key={gap.id} className="rounded-lg border border-white/10 px-3 py-2 text-xs">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={gapTone[gap.impact]}>{gap.impact} impact</StatusBadge>
                  <span className="font-medium">{gap.field}</span>
                  <span className="font-mono text-[11px] text-subtle">{gap.scope}</span>
                </span>
                <span className="mt-1 block text-subtle">{gap.reason}</span>
                {gap.requiredFor ? <span className="mt-1 block text-subtle">Required for: {gap.requiredFor}</span> : null}
                <span className="mt-1 block text-subtle">
                  {gap.canRetry ? "Retryable." : "Not retryable."} {gap.fallbackUsed ? "A fallback was used." : "No fallback was used."}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-subtle">{coverage.note}</p>
    </section>
  );
}
