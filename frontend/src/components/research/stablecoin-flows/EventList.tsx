import type { FlowEvent } from "@/server/research/stablecoin-flows/schema";

/** The largest single mints and burns, each linking to its own transaction. */
export function EventList({ events, symbol }: { events: FlowEvent[]; symbol: string }) {
  return (
    <section className="space-y-3" aria-label="Largest single events">
      <h2 className="text-lg font-semibold">Largest single events</h2>
      {events.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="pb-2 text-left">Largest recorded {symbol} mints and burns in this window</caption>
            <thead>
              <tr>
                {["Observed at (UTC)", "Chain", "Direction", `Amount (${symbol})`, "Transaction"].map((label) => (
                  <th key={label} scope="col" className="p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={`${event.chain}:${event.txId}:${event.at}`}>
                  <th scope="row" className="p-2">
                    {event.at}
                  </th>
                  <td className="p-2">{event.chain}</td>
                  <td className="p-2">{event.direction === "mint" ? "Mint" : "Burn"}</td>
                  <td className="p-2 tabular-nums">{event.amount}</td>
                  <td className="max-w-64 break-all p-2">
                    <a href={event.txUrl} target="_blank" rel="noreferrer noopener" className="underline">
                      {event.txId}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No mint or burn was recorded on the chains that could be read.</p>
      )}
    </section>
  );
}
