"use client";

import type { TimelineEntry } from "@/server/research/incident-status/schema";

/**
 * Source-linked chronology. Undated entries stay at the end as unknown rather
 * than being placed at "now".
 */
export function StatusTimeline({ timeline }: { timeline: TimelineEntry[] }) {
  if (timeline.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No timeline entries are available.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="incident-timeline">
      {timeline.map((entry) => (
        <li
          key={`${entry.documentId}-${entry.kind}-${entry.at ?? "unknown"}`}
          className="rounded-xl border border-white/10 px-4 py-3"
        >
          <p className="text-xs uppercase tracking-wide text-subtle">
            {entry.kind === "unknown" ? "Unknown time" : entry.kind} · {entry.authority} · {entry.effectiveStatus}
          </p>
          <p className="mt-1 text-sm font-medium">{entry.title}</p>
          <p className="mt-1 text-xs text-subtle">{entry.at ?? "No timestamp reported"}</p>
          <p className="mt-1 text-xs text-subtle">{entry.note}</p>
        </li>
      ))}
    </ol>
  );
}
