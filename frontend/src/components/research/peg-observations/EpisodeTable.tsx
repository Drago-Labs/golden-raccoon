import React from "react";
import { type DeviationEpisode } from "@/server/research/peg-observations";

interface EpisodeTableProps {
  episodes: DeviationEpisode[];
  className?: string;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "Ongoing";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = (minutes / 60).toFixed(1);
  return `${hours}h`;
}

/**
 * Accessible table listing detected peg deviation episodes with duration,
 * peak severity, and documented gap interruption status.
 */
export function EpisodeTable({ episodes, className = "" }: EpisodeTableProps) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 backdrop-blur-sm ${className}`}>
      <div className="border-b border-zinc-800/80 pb-4">
        <h3 className="text-sm font-semibold tracking-wide text-zinc-200 uppercase">
          Observed Threshold Episodes & Recovery
        </h3>
        <p className="mt-0.5 text-xs text-zinc-400">
          Continuous periods where deviation reached or exceeded the configured threshold.
          Episodes spanning unobserved intervals are marked as interrupted rather than assuming recovery.
        </p>
      </div>

      {episodes.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-300">No Breach Episodes Detected</p>
          <p className="mt-1 text-xs text-zinc-500">
            All observed normalized prices remained strictly within threshold bounds throughout the window.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-200">
            <caption className="sr-only">
              Listing of peg deviation episodes detected within the observation window
            </caption>
            <thead className="border-b border-zinc-800 text-[11px] text-zinc-400 uppercase">
              <tr>
                <th scope="col" className="px-3 py-2.5">
                  Episode
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Direction
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Start Time
                </th>
                <th scope="col" className="px-3 py-2.5">
                  End / Resolution
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Duration
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Peak Deviation
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Resolution Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70 font-mono">
              {episodes.map((ep) => {
                const isRecovered = ep.status === "recovered";
                const isInterrupted = ep.status === "interrupted_by_gap";
                const isActive = ep.status === "active";

                return (
                  <tr key={ep.id} className="hover:bg-zinc-800/30">
                    <td className="px-3 py-3 font-semibold text-zinc-100">{ep.id}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          ep.direction === "above"
                            ? "bg-emerald-950/60 text-emerald-300"
                            : "bg-rose-950/60 text-rose-300"
                        }`}
                      >
                        {ep.direction === "above" ? "Premium (+)" : "Discount (-)"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-400">
                      {new Date(ep.startTime).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-3 text-zinc-400">
                      {ep.endTime ? new Date(ep.endTime).toLocaleTimeString() : "Unresolved (Active)"}
                    </td>
                    <td className="px-3 py-3 text-zinc-300">{formatDuration(ep.durationMs)}</td>
                    <td className="px-3 py-3 font-bold text-rose-400">
                      {ep.peakDeviationBps > 0 ? `+${ep.peakDeviationBps}` : ep.peakDeviationBps} bps
                    </td>
                    <td className="px-3 py-3">
                      {isRecovered && (
                        <span className="inline-flex items-center rounded-full border border-emerald-700 bg-emerald-950/60 px-2 py-0.5 text-[11px] text-emerald-300">
                          Recovered
                        </span>
                      )}
                      {isInterrupted && (
                        <span className="inline-flex items-center rounded-full border border-orange-700 bg-orange-950/60 px-2 py-0.5 text-[11px] text-orange-300">
                          Interrupted by Gap
                        </span>
                      )}
                      {isActive && (
                        <span className="inline-flex items-center rounded-full border border-amber-700 bg-amber-950/60 px-2 py-0.5 text-[11px] text-amber-300">
                          Active Breach
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
