import type { DecodedContractEvent } from "@/server/research/event-decoder";

export function RawEventView(props: { event: DecodedContractEvent }) {
  const { event } = props;
  return (
    <div className="mt-2 rounded border border-white/10 bg-black/40 p-2 font-mono text-[11px] text-white/75">
      <div>Raw topics: {event.rawTopicsDisplay.join(" | ")}</div>
      <div>Raw data: {event.rawDataDisplay}</div>
    </div>
  );
}
