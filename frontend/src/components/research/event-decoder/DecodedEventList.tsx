import type { DecodedContractEvent } from "@/server/research/event-decoder";
import { RawEventView } from "./RawEventView";

export function DecodedEventList(props: { events: DecodedContractEvent[]; showRaw: boolean }) {
  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Decoded contract events</h3>
      {props.events.length === 0 ? (
        <p className="text-white/60">No events returned in the retained ledger window.</p>
      ) : (
        <ul className="space-y-3">
          {props.events.map((ev) => (
            <li key={ev.eventId} className="space-y-2 rounded border border-white/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-white">
                  {ev.matchedSpecName ?? "Unmatched Event (Raw Fallback)"}
                </span>
                <span className="font-mono text-white/60">
                  Ledger {ev.ledger} • {ev.eventId}
                </span>
              </div>
              {ev.mismatchReason && (
                <p className="rounded bg-amber-500/10 px-2 py-1 text-amber-200">
                  Spec mismatch: {ev.mismatchReason}
                </p>
              )}
              {ev.fields.length > 0 && (
                <dl className="grid gap-2 sm:grid-cols-3">
                  {ev.fields.map((f) => (
                    <div key={`${f.location}-${f.name}`}>
                      <dt className="text-white/50">
                        {f.name} ({f.type}, {f.location})
                      </dt>
                      <dd className="font-mono text-white">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {(props.showRaw || ev.matchedSpecName === null) && <RawEventView event={ev} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
