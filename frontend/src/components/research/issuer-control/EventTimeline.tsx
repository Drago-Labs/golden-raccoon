import type { ControlEvent } from "@/server/research/issuer-control/schema";

export function EventTimeline({ events }: { events: ControlEvent[] }) {
  if (!events.length) {
    return (
      <section aria-labelledby="events-heading" className="rounded-2xl border border-white/10 p-4">
        <h2 id="events-heading" className="text-lg font-semibold">
          Authorization and clawback events
        </h2>
        <p className="mt-2 text-sm text-white/55">No matching events in the bounded Horizon window.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="events-heading" className="rounded-2xl border border-white/10 p-4">
      <h2 id="events-heading" className="text-lg font-semibold">
        Authorization and clawback events
      </h2>
      <ol aria-label="Issuer control events" className="mt-3 space-y-3">
        {events.map((event) => (
          <li key={event.id} tabIndex={0} className="rounded-xl border border-white/10 p-3 text-sm focus:outline focus:outline-2 focus:outline-[#d9a441]">
            <div className="font-medium">{event.kind.replaceAll("_", " ")}</div>
            <p className="mt-1 text-white/55">{event.note}</p>
            <dl className="mt-2 grid gap-1 text-xs text-white/45 sm:grid-cols-2">
              <div>
                <dt className="inline">Ledger: </dt>
                <dd className="inline">{event.ledger ?? "unavailable"}</dd>
              </div>
              <div>
                <dt className="inline">Time: </dt>
                <dd className="inline">{event.closedAt ?? "unavailable"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline">Source: </dt>
                <dd className="inline break-all">{event.source}</dd>
              </div>
              {event.amount ? (
                <div>
                  <dt className="inline">Amount: </dt>
                  <dd className="inline font-mono">{event.amount}</dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
