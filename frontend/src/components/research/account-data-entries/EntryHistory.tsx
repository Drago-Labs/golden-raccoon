import type { HistoryEvent } from "@/server/research/account-data-entries/schema";

export function EntryHistory({ entryKey, events, truncated, oldestLedger }: { entryKey: string; events: HistoryEvent[]; truncated: boolean; oldestLedger: number | null }) {
  return (
    <section data-testid="entry-history" className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">History for {entryKey}</h2>
      {truncated ? <p>History truncated. Oldest ledger reached: {oldestLedger ?? "unknown"}.</p> : null}
      <ol className="flex flex-col gap-2">
        {events.map((event) => (
          <li key={`${event.ledger}-${event.action}-${event.valueBase64 ?? "deleted"}`}>
            <p>
              Ledger {event.ledger}: {event.action} by <span className="font-mono text-xs">{event.sourceAccount}</span>
            </p>
            {event.action === "delete" ? <p>Last value: {event.lastValueUtf8 ?? event.lastValueBase64 ?? "not in the fetched history"}</p> : null}
            {event.action !== "delete" && event.utf8 ? <p>{event.utf8}</p> : null}
            {event.action !== "delete" && !event.utf8 ? <p className="font-mono text-xs">{event.hex}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
