import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { AgentDifference } from "@/server/research/run-comparison/schema";

const ALIGNMENT_LABELS: Record<AgentDifference["alignment"], string> = {
  present_in_both: "In both",
  only_in_left: "Only in the first",
  only_in_right: "Only in the second",
};

/**
 * Per-agent differences, side by side.
 *
 * An agent present in only one run shows an em dash on the missing side rather
 * than a zero. A zero is a measurement; an absence is not, and rendering one as
 * the other would invent a score drop that never happened.
 */
export function AgentDifferenceTable({ differences }: { differences: AgentDifference[] }) {
  if (differences.length === 0) {
    return (
      <p data-testid="agent-differences-empty" className="text-sm text-white/54">
        Neither run stored an agent result, so there is nothing to align.
      </p>
    );
  }

  return (
    <div data-testid="agent-difference-table" className="flex flex-col gap-4">
      {differences.map((difference) => (
        <section key={difference.agent} className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white/80">{difference.agent}</h3>
            <StatusBadge tone={difference.alignment === "present_in_both" ? "neutral" : "warning"}>
              {ALIGNMENT_LABELS[difference.alignment]}
            </StatusBadge>
            {difference.coOccurringCoverageDrop ? <StatusBadge tone="warning">Coverage also dropped</StatusBadge> : null}
          </div>

          <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-white/42">Risk score</dt>
              <dd className="mt-0.5 font-mono tabular-nums text-white/78">
                {difference.scoreChange.before ?? "—"} → {difference.scoreChange.after ?? "—"}
                {difference.scoreChange.delta !== null && difference.scoreChange.delta !== 0 ? (
                  <span className="ml-1 text-[#f2c86d]">
                    ({difference.scoreChange.delta > 0 ? "+" : ""}
                    {difference.scoreChange.delta})
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-white/42">Recommended action</dt>
              <dd className="mt-0.5 text-white/78">
                {difference.recommendationChange.before ?? "—"} → {difference.recommendationChange.after ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-white/42">Missing data</dt>
              <dd className="mt-0.5 text-white/78">
                {difference.missingDataChange.before.length} → {difference.missingDataChange.after.length}
                {difference.missingDataChange.after.length > 0 ? (
                  <span className="mt-0.5 block text-white/42">{difference.missingDataChange.after.join(", ")}</span>
                ) : null}
              </dd>
            </div>
          </dl>

          {difference.findings.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
                <caption className="sr-only">Findings for {difference.agent}, aligned across the two runs</caption>
                <thead>
                  <tr className="uppercase tracking-[0.12em] text-white/42">
                    <th scope="col" className="py-1.5 pr-4 font-medium">
                      Finding
                    </th>
                    <th scope="col" className="py-1.5 pr-4 font-medium">
                      First run
                    </th>
                    <th scope="col" className="py-1.5 font-medium">
                      Second run
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {difference.findings.map((pair) => (
                    <tr key={pair.pairId} className="border-t border-white/8 align-top">
                      <td className="py-2 pr-4">
                        <span className="text-white/78">{pair.label}</span>
                        <span className="mt-1 block">
                          <StatusBadge tone={pair.alignment === "ambiguous" ? "warning" : "neutral"}>{pair.alignment}</StatusBadge>
                        </span>
                        {pair.ambiguityNote ? <span className="mt-1 block text-white/42">{pair.ambiguityNote}</span> : null}
                      </td>
                      <td className="py-2 pr-4 text-white/70">
                        {pair.left ? `${pair.left.severity}${pair.left.scoreImpact === null ? "" : ` · ${pair.left.scoreImpact}`}` : "—"}
                      </td>
                      <td className="py-2 text-white/70">
                        {pair.right ? `${pair.right.severity}${pair.right.scoreImpact === null ? "" : ` · ${pair.right.scoreImpact}`}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
