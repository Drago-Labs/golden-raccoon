"use client";

import { STABLECOIN_FLOW_LIMITS } from "@/server/research/stablecoin-flows/limits";

/** Picks the UTC window the flows are aggregated over. */
export function WindowSelector({
  start,
  end,
  topEvents,
  busy,
  onStartChange,
  onEndChange,
  onTopEventsChange,
  onSubmit,
}: {
  start: string;
  end: string;
  topEvents: number;
  busy: boolean;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onTopEventsChange: (value: number) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex flex-col gap-1">
        From (UTC)
        <input
          type="datetime-local"
          required
          value={start}
          onChange={(event) => onStartChange(event.target.value)}
          className="min-h-11 rounded border bg-transparent p-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        Through (UTC)
        <input
          type="datetime-local"
          required
          value={end}
          onChange={(event) => onEndChange(event.target.value)}
          className="min-h-11 rounded border bg-transparent p-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        Largest events
        <input
          type="number"
          min={1}
          max={STABLECOIN_FLOW_LIMITS.maxRankedEvents}
          value={topEvents}
          onChange={(event) => onTopEventsChange(Number(event.target.value))}
          className="min-h-11 w-28 rounded border bg-transparent p-2"
        />
      </label>
      <button type="submit" disabled={busy} className="min-h-11 rounded border px-4 py-2">
        {busy ? "Reading…" : "Read flows"}
      </button>
      <p className="basis-full text-sm">
        A window may cover at most {STABLECOIN_FLOW_LIMITS.maxWindowDays} days. Days are UTC.
      </p>
    </form>
  );
}
