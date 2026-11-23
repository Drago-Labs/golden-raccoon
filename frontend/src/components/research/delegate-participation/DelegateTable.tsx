import type { DelegateRow } from "@/server/research/delegate-participation/schema";

function rate(participationBps: string | null): string {
  if (participationBps === null) return "No eligible proposal";
  return `${(Number(participationBps) / 100).toFixed(2)}%`;
}

/** Voting power and participation per delegate, with what each figure rests on. */
export function DelegateTable({ delegates }: { delegates: DelegateRow[] }) {
  return (
    <section className="space-y-3" aria-label="Delegates">
      <h2 className="text-lg font-semibold">Delegates</h2>
      {delegates.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="pb-2 text-left">
              Voting power at the end of the scanned range and participation over the proposals each delegate held power
              for
            </caption>
            <thead>
              <tr>
                {["Delegate", "Coverage", "Power at end of range", "Peak power", "Eligible", "Voted", "Undetermined", "Participation"].map(
                  (label) => (
                    <th key={label} scope="col" className="p-2">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {delegates.map((delegate) => (
                <tr key={delegate.address}>
                  <th scope="row" className="max-w-56 break-all p-2">
                    {delegate.address}
                  </th>
                  <td className="p-2">
                    {delegate.state === "complete" ? "Complete" : "Partial"}
                    {delegate.notes.length ? <span className="block text-xs">{delegate.notes.join(" ")}</span> : null}
                  </td>
                  <td className="p-2 tabular-nums">{delegate.currentPowerUnits ?? "Unknown"}</td>
                  <td className="p-2 tabular-nums">{delegate.peakPowerUnits ?? "Unknown"}</td>
                  <td className="p-2 tabular-nums">{delegate.eligibleProposals.length}</td>
                  <td className="p-2 tabular-nums">{delegate.votedProposals.length}</td>
                  <td className="p-2 tabular-nums">{delegate.undeterminedProposals.length}</td>
                  <td className="p-2 tabular-nums">{rate(delegate.participationBps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No delegate was named and none was found holding power in the scanned range.</p>
      )}
    </section>
  );
}
