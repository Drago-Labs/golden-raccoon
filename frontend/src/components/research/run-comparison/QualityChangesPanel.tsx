import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { QualityChange } from "@/server/research/run-comparison/schema";

/**
 * How provider coverage changed.
 *
 * Rendered as its own panel, apart from the agent differences, because the two
 * are different kinds of fact. Each row carries the timestamps the two
 * measurements were taken at, and the note that says what the change does not
 * establish.
 */
export function QualityChangesPanel({ changes }: { changes: QualityChange[] }) {
  if (changes.length === 0) {
    return <p className="text-sm text-white/54">No data quality was recorded for either run.</p>;
  }

  return (
    <div data-testid="quality-changes" className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <caption className="sr-only">Provider coverage for each agent, in both runs</caption>
        <thead>
          <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
            <th scope="col" className="py-2 pr-4 font-medium">
              Agent
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              First run
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Second run
            </th>
            <th scope="col" className="py-2 font-medium">
              Reading
            </th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.agent} className="border-t border-white/8 align-top">
              <td className="py-3 pr-4">
                <span className="text-white/78">{change.agent}</span>
                {change.coverageDropped ? (
                  <span className="mt-1.5 block">
                    <StatusBadge tone="warning">Coverage dropped</StatusBadge>
                  </span>
                ) : null}
              </td>
              <td className="py-3 pr-4 text-xs text-white/70">
                {change.left ? (
                  <>
                    {change.left.mode} · {change.left.connectedSources} connected, {change.left.unavailableSources} unavailable
                    <span className="mt-0.5 block text-white/42">{change.left.lastCheckedAt ?? "no timestamp"}</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-3 pr-4 text-xs text-white/70">
                {change.right ? (
                  <>
                    {change.right.mode} · {change.right.connectedSources} connected, {change.right.unavailableSources} unavailable
                    <span className="mt-0.5 block text-white/42">{change.right.lastCheckedAt ?? "no timestamp"}</span>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-3 text-xs leading-5 text-white/54">{change.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
