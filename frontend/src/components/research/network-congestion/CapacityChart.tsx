import type { CapacitySummary } from "@/server/research/network-congestion/schema";

function percent(basisPoints: number | null): string {
  if (basisPoints === null) return "unknown";

  const whole = Math.floor(basisPoints / 100);
  const fraction = String(basisPoints % 100).padStart(2, "0");

  return `${whole}.${fraction}%`;
}

/**
 * Capacity of each present ledger, with a table that carries the same numbers as the bars.
 *
 * The table scrolls sideways below the width of its columns, so a 390px screen
 * still reaches every ledger. Gap rows have no bar and are not part of the mean.
 */
export function CapacityChart({ capacity }: { capacity: CapacitySummary }) {
  if (capacity.ledgers.length === 0 && capacity.gaps.length === 0) {
    return <p className="text-sm text-white/54">No ledger was present in this window.</p>;
  }

  const rows = [
    ...capacity.ledgers.map((ledger) => ({ kind: "ledger" as const, sequence: ledger.sequence, ledger })),
    ...capacity.gaps.map((gap) => ({ kind: "gap" as const, sequence: gap.fromSequence, gap })),
  ].sort((left, right) => left.sequence - right.sequence);

  return (
    <div data-testid="capacity-chart">
      <p className="text-sm text-white/70">
        Mean usage {capacity.meanUsageBasisPoints === null ? "is not available" : percent(capacity.meanUsageBasisPoints)} across{" "}
        {capacity.presentLedgerCount} present ledger(s). {capacity.fullLedgerCount} were at capacity. Missing ledgers are excluded from that mean.
      </p>
      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Ledger capacity">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            Operation capacity by ledger. Missing ledgers are listed and excluded from the average.
          </caption>
          <thead>
            <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
              <th scope="col" className="py-2 pr-4 font-medium">
                Ledger
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Closed
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Operations
              </th>
              <th scope="col" className="py-2 font-medium">
                Usage
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.kind === "gap" ? (
                <tr key={`gap-${row.gap.fromSequence}`} data-testid="capacity-gap" className="border-t border-white/8">
                  <th scope="row" className="py-3 pr-4 font-mono text-xs font-medium">
                    {row.gap.fromSequence === row.gap.toSequence ? row.gap.fromSequence : `${row.gap.fromSequence}–${row.gap.toSequence}`}
                  </th>
                  <td className="py-3 pr-4 text-xs text-white/54">Missing</td>
                  <td className="py-3 pr-4 text-xs text-white/54">{row.gap.missingCount} excluded</td>
                  <td className="py-3 text-xs text-white/70">Excluded from statistics</td>
                </tr>
              ) : (
                <tr key={row.ledger.sequence} className="border-t border-white/8">
                  <th scope="row" className="py-3 pr-4 font-mono text-xs font-medium">
                    {row.ledger.sequence}
                  </th>
                  <td className="py-3 pr-4 text-xs text-white/54">
                    <time dateTime={row.ledger.closedAt}>{row.ledger.closedAt}</time>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs tabular-nums text-white/78">
                    {row.ledger.operationCount} / {row.ledger.maxOperations}
                    {row.ledger.full ? " · full" : ""}
                  </td>
                  <td className="py-3">
                    <span className="font-mono text-xs tabular-nums text-white/78">{percent(row.ledger.usageBasisPoints)}</span>
                    <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/8">
                      <span
                        className="block h-full rounded-full bg-[#d9a441]"
                        style={{ width: `${Math.min(100, (row.ledger.usageBasisPoints ?? 0) / 100)}%` }}
                      />
                    </span>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
