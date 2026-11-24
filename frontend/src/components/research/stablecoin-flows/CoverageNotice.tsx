import type { ChainCoverage } from "@/server/research/stablecoin-flows/schema";

/** What the answer rests on, per chain, and what it does not cover. */
export function CoverageNotice({ coverage, notes }: { coverage: ChainCoverage[]; notes: string[] }) {
  return (
    <aside className="space-y-3 rounded border p-4" aria-label="Evidence coverage">
      <h2 className="text-lg font-semibold">Evidence coverage</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-2 text-left">Per-chain coverage and the configured source for each deployment</caption>
          <thead>
            <tr>
              {["Chain", "Coverage", "Events", "First event", "Last event", "Read from"].map((label) => (
                <th key={label} scope="col" className="p-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coverage.map((row) => (
              <tr key={row.chain}>
                <th scope="row" className="p-2">
                  {row.chain}
                </th>
                <td className="p-2">
                  {row.state === "complete" ? "Complete" : row.state === "partial" ? "Incomplete" : "Not read"}
                  {row.notes.length ? <span className="block text-xs">{row.notes.join(" ")}</span> : null}
                </td>
                <td className="p-2 tabular-nums">{row.eventCount}</td>
                <td className="p-2">{row.firstEventAt ?? "—"}</td>
                <td className="p-2">{row.lastEventAt ?? "—"}</td>
                <td className="max-w-64 break-all p-2">
                  <a href={row.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
                    {row.identity}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="list-inside list-disc text-sm">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </aside>
  );
}
