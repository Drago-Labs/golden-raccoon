import type { DelegationChange } from "@/server/research/delegate-participation/schema";

/** The largest movements of voting power, each linking to its own transaction. */
export function DelegationChangeList({ changes }: { changes: DelegationChange[] }) {
  return (
    <section className="space-y-3" aria-label="Largest delegation changes">
      <h2 className="text-lg font-semibold">Largest delegation changes</h2>
      {changes.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="pb-2 text-left">
              Largest recorded changes in voting power, with the delegators whose delegation moved in the same
              transaction
            </caption>
            <thead>
              <tr>
                {["Block", "Delegate", "Power before", "Power after", "Change", "Delegators", "Transaction"].map((label) => (
                  <th key={label} scope="col" className="p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={`${change.txId}:${change.delegate}:${change.blockNumber}`}>
                  <th scope="row" className="p-2 tabular-nums">
                    {change.blockNumber}
                  </th>
                  <td className="max-w-56 break-all p-2">{change.delegate}</td>
                  <td className="p-2 tabular-nums">{change.previousPowerUnits}</td>
                  <td className="p-2 tabular-nums">{change.newPowerUnits}</td>
                  <td className="p-2 tabular-nums">{change.deltaUnits}</td>
                  <td className="max-w-56 break-all p-2">{change.delegators.length ? change.delegators.join(", ") : "Not in this transaction"}</td>
                  <td className="max-w-64 break-all p-2">
                    <a href={change.txUrl} target="_blank" rel="noreferrer noopener" className="underline">
                      {change.txId}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No delegation change was recorded in the scanned range.</p>
      )}
    </section>
  );
}
