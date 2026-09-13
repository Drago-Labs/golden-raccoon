"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { DeviationEpisode } from "@/server/research/peg-observations/schema";

function duration(seconds: number | null): string {
  if (seconds === null) return "Not observed";
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Observed threshold episodes.
 *
 * Every duration is between two observed points. Where a gap falls inside an
 * episode the row says the figure is a lower bound, and an episode with no
 * observed recovery says recovery was not seen rather than that it failed.
 */
export function EpisodeTable({ episodes, thresholdBps }: { episodes: DeviationEpisode[]; thresholdBps: number }) {
  if (episodes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No observation in this window reached {thresholdBps} basis points from the declared target. That is not a
        guarantee the peg held during unobserved intervals.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Episodes where an observation sat at or beyond {thresholdBps} bps from target. Boundaries are observed points,
          never interpolated.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Started</th>
            <th scope="col" className="py-2 pr-3">Recovered</th>
            <th scope="col" className="py-2 pr-3">Observed duration</th>
            <th scope="col" className="py-2 pr-3">Peak</th>
            <th scope="col" className="py-2 pr-3">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {episodes.map((episode) => (
            <tr key={episode.startedAt} className="border-b border-white/5 align-top">
              <th scope="row" className="py-2 pr-3 font-medium">
                {episode.startedAt}
                <span className="mt-1 block text-xs font-normal text-subtle">
                  {episode.direction === "above_target" ? "Above target" : "Below target"} ·{" "}
                  {episode.observationCount} observation{episode.observationCount === 1 ? "" : "s"}
                </span>
              </th>
              <td className="py-2 pr-3 text-xs">{episode.recoveredAt ?? <span className="text-subtle">Not observed</span>}</td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {duration(episode.observedDurationSeconds)}
                {episode.containsGap ? <span className="block text-subtle">lower bound</span> : null}
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums">{episode.peakDeviationBps} bps</td>
              <td className="py-2 pr-3 text-xs">
                <StatusBadge tone={episode.containsGap || episode.recoveredAt === null ? "warning" : "success"}>
                  {episode.recoveredAt === null ? "Recovery unobserved" : episode.containsGap ? "Spans a gap" : "Fully observed"}
                </StatusBadge>
                <span className="mt-1 block text-subtle">{episode.note}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
