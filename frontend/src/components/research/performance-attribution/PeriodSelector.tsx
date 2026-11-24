"use client";

import { ATTRIBUTION_LIMITS } from "@/server/research/performance-attribution/limits";

/** Picks the window and the period length the attribution is broken into. */
export function PeriodSelector({
  start,
  end,
  granularity,
  busy,
  onStartChange,
  onEndChange,
  onGranularityChange,
  onSubmit,
}: {
  start: string;
  end: string;
  granularity: "day" | "week" | "month";
  busy: boolean;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onGranularityChange: (value: "day" | "week" | "month") => void;
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
        Period
        <select
          value={granularity}
          onChange={(event) => onGranularityChange(event.target.value as "day" | "week" | "month")}
          className="min-h-11 rounded border bg-background p-2"
        >
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
      </label>
      <button type="submit" disabled={busy} className="min-h-11 rounded border px-4 py-2">
        {busy ? "Attributing…" : "Attribute performance"}
      </button>
      <p className="basis-full text-sm">
        At most {ATTRIBUTION_LIMITS.maxWindowDays} days and {ATTRIBUTION_LIMITS.maxPeriods} periods per report. Periods
        are UTC.
      </p>
    </form>
  );
}
