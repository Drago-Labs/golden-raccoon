import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ExcludedRecord, FeeCharge } from "@/server/research/fee-analysis/schema";

const REASON_LABELS: Record<ExcludedRecord["reason"], string> = {
  superseded_by_replacement: "Replaced",
  duplicate_observation: "Duplicate",
  not_terminal: "Still in flight",
  out_of_window: "Outside window",
  other_wallet: "Other account",
  other_network: "Other network",
};

/**
 * What the totals do not cover.
 *
 * This table is the counterweight to the numbers above. Charges that could not
 * be read and records that were deliberately excluded are listed with their
 * reasons, so a reader can see the shape of what is missing rather than
 * inferring from a total that looks whole.
 */
export function CoverageTable({ charges, excluded }: { charges: FeeCharge[]; excluded: ExcludedRecord[] }) {
  const unreadable = charges.filter((charge) => charge.evidence === "unknown");

  if (unreadable.length === 0 && excluded.length === 0) {
    return (
      <p data-testid="coverage-complete" className="text-sm text-white/54">
        Every record in this window was attributed, and every charge was read. Nothing is missing from the totals.
      </p>
    );
  }

  return (
    <div data-testid="coverage-table" className="flex flex-col gap-5">
      {unreadable.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-white/80">Charges that exist but could not be read</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {unreadable.map((charge) => (
              <li key={charge.chargeId} className="rounded-2xl border border-white/10 bg-white/4 p-3 text-xs">
                <p className="break-all font-mono text-white/70">{charge.hash}</p>
                <p className="mt-1 text-white/54">{charge.unknownReason}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {excluded.length > 0 ? (
        <div className="overflow-x-auto">
          <h3 className="text-sm font-semibold text-white/80">Records excluded from attribution</h3>
          <table className="mt-3 w-full min-w-[30rem] border-collapse text-left text-sm">
            <caption className="sr-only">Records deliberately excluded, and why</caption>
            <thead>
              <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Reason
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Transaction
                </th>
                <th scope="col" className="py-2 font-medium">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {excluded.map((entry) => (
                <tr key={`${entry.hash}-${entry.reason}`} className="border-t border-white/8 align-top">
                  <td className="py-3 pr-4">
                    <StatusBadge tone="neutral">{REASON_LABELS[entry.reason]}</StatusBadge>
                  </td>
                  <td className="py-3 pr-4 break-all font-mono text-xs text-white/70">
                    {entry.hash}
                    {entry.supersededBy ? (
                      <span className="mt-0.5 block font-sans text-white/42">counted as {entry.supersededBy}</span>
                    ) : null}
                  </td>
                  <td className="py-3 text-xs leading-5 text-white/54">{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
