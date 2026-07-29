"use client";

import type { SourceSnapshotDetail } from "@/server/types";

type SourceSnapshotListProps = {
  snapshots: SourceSnapshotDetail[];
  loading?: boolean;
  error?: string | null;
};

function statusColor(status: string) {
  switch (status) {
    case "connected": return "bg-green-500/60";
    case "mock": return "bg-yellow-500/60";
    case "unavailable": return "bg-red-500/60";
    default: return "bg-gray-500/60";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "connected": return "Connected";
    case "mock": return "Mock";
    case "unavailable": return "Unavailable";
    default: return status;
  }
}

export function SourceSnapshotList({ snapshots, loading, error }: SourceSnapshotListProps) {
  if (loading) {
    return (
      <div className="rounded-lg bg-white/5 p-4 text-sm text-white/42">
        Loading source snapshots...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300/20 bg-red-500/5 p-4 text-sm text-red-200/70">
        {error}
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="rounded-lg bg-white/5 p-4 text-sm text-white/42">
        No source snapshots recorded for this run.
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white/5 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">
        Source Snapshots ({snapshots.length})
      </div>
      <div className="space-y-2">
        {snapshots.map((snap, i) => (
          <div
            key={`${snap.agent}-${snap.label}-${i}`}
            className="flex flex-wrap items-start gap-3 rounded-md bg-white/[0.03] px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusColor(snap.status)}`} />
              <span className="font-medium text-white/70">{snap.label}</span>
            </div>
            <span className="text-white/38">{snap.agent}</span>
            {snap.url && (
              <a
                href={snap.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-blue-400/70 underline underline-offset-2 hover:text-blue-300"
              >
                source
              </a>
            )}
            <span className="ml-auto text-white/38">{statusLabel(snap.status)}</span>
            {snap.reliability != null && (
              <span className="text-white/38">Reliability: {Math.round(snap.reliability * 100)}%</span>
            )}
            {snap.latencyMs != null && (
              <span className="text-white/38">{snap.latencyMs}ms</span>
            )}
            {snap.checkedAt && (
              <span className="text-white/38">{new Date(snap.checkedAt).toLocaleString("en-US")}</span>
            )}
            {snap.error && (
              <span className="w-full text-red-300/60">{snap.error}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
