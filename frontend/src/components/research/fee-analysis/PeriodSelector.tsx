"use client";

import { useId, useState } from "react";

const PRESETS = [
  { id: "7d", label: "Last 7 days", days: 7, bucket: "day" as const },
  { id: "30d", label: "Last 30 days", days: 30, bucket: "day" as const },
  { id: "90d", label: "Last 90 days", days: 90, bucket: "week" as const },
  { id: "365d", label: "Last 12 months", days: 365, bucket: "month" as const },
];

export type PeriodSelection = { from: string; to: string; bucket: "day" | "week" | "month" };

/**
 * The window the analysis covers.
 *
 * The window is computed once, at submit, and sent as explicit `from` and `to`
 * timestamps rather than as "last 30 days". A relative window evaluated on the
 * server would make the same request return different numbers depending on
 * when it arrived.
 */
export function PeriodSelector({ busy, onSubmit }: { busy: boolean; onSubmit: (period: PeriodSelection) => void }) {
  const presetId = useId();
  const [preset, setPreset] = useState(PRESETS[1].id);

  return (
    <form
      aria-label="Fee analysis period"
      className="glass-panel flex flex-col gap-4 rounded-[28px] p-5 sm:flex-row sm:items-end sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();

        const selected = PRESETS.find((entry) => entry.id === preset) ?? PRESETS[1];
        const to = new Date();
        const from = new Date(to.getTime() - selected.days * 86_400_000);

        onSubmit({ from: from.toISOString(), to: to.toISOString(), bucket: selected.bucket });
      }}
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor={presetId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
          Period
        </label>
        <select
          id={presetId}
          name="period"
          value={preset}
          onChange={(event) => setPreset(event.target.value)}
          className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40 sm:max-w-xs"
        >
          {PRESETS.map((entry) => (
            <option key={entry.id} value={entry.id} className="bg-[#151515]">
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="rounded-2xl border border-white/14 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
      >
        {busy ? "Reading…" : "Analyse fees"}
      </button>
    </form>
  );
}
