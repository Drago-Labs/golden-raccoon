import type { StorageEntryDiagnostic } from "@/server/research/storage-lifetime/schema";

/**
 * Remaining lifetime bars plus a table that includes unavailable observations.
 * Bars are decorative; every entry (including missing remainingLedgers) appears in the table.
 */
export function LifetimeChart({ entries }: { entries: StorageEntryDiagnostic[] }) {
  const known = entries.filter((entry) => entry.remainingLedgers !== null);
  const max = Math.max(1, ...known.map((entry) => entry.remainingLedgers!));

  return (
    <section aria-label="Remaining lifetime" className="space-y-4 rounded-2xl border border-white/10 p-5">
      <h2 className="font-semibold">Remaining lifetime</h2>
      {known.length ? (
        <div aria-hidden="true" className="space-y-3">
          {known.map((entry) => (
            <div key={`bar-${entry.keyXdr}`}>
              <div className="mb-1 flex justify-between text-xs">
                <span>{entry.kind}</span>
                <span>{entry.remainingLedgers} ledgers</span>
              </div>
              <div className="h-2 rounded bg-white/10">
                <div
                  className="h-2 rounded bg-[#d9a441]"
                  style={{ width: `${Math.max(1, (entry.remainingLedgers! / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-white/55">No entry has a known remaining-ledger count to plot.</p>
      )}
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Storage lifetime values for every requested key, including unavailable remaining-ledger observations
        </caption>
        <thead>
          <tr>
            <th scope="col">Kind</th>
            <th scope="col">State</th>
            <th scope="col">Remaining ledgers</th>
            <th scope="col">Live until</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.keyXdr}>
              <td>{entry.kind}</td>
              <td>{entry.state}</td>
              <td>{entry.remainingLedgers == null ? "unavailable" : entry.remainingLedgers}</td>
              <td>{entry.liveUntilLedger == null ? "unavailable" : entry.liveUntilLedger}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
