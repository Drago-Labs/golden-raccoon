import type { FormEvent } from "react";
import type { SeriesInterval } from "@/server/research/volatility-profile";

export function SeriesInput(props: {
  connected: boolean;
  assetSymbol: string;
  onAssetChange: (v: string) => void;
  interval: SeriesInterval;
  onIntervalChange: (v: SeriesInterval) => void;
  windowDays: string;
  onWindowDaysChange: (v: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-4 rounded-lg border border-white/10 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          <span>Asset symbol</span>
          <input
            aria-label="Asset symbol"
            value={props.assetSymbol}
            onChange={(e) => props.onAssetChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Interval</span>
          <select
            aria-label="Interval"
            value={props.interval}
            onChange={(e) => props.onIntervalChange(e.target.value as SeriesInterval)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          >
            <option value="1d">1d</option>
            <option value="1h">1h</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Window (days)</span>
          <input
            aria-label="Window (days)"
            value={props.windowDays}
            onChange={(e) => props.onWindowDaysChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={!props.connected || props.busy}
        className="rounded bg-white/90 px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
      >
        Profile volatility
      </button>
    </form>
  );
}
