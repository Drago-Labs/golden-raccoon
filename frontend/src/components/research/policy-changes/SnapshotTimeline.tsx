"use client";

import type { PolicySnapshot } from "@/server/research/policy-changes/schema";

export function SnapshotTimeline({ timeline }: { timeline: PolicySnapshot[] }) {
  if (timeline.length === 0) {
    return (
      <section aria-labelledby="snapshot-timeline-heading" data-testid="snapshot-timeline">
        <h2 id="snapshot-timeline-heading" className="text-lg font-semibold">
          Snapshot timeline
        </h2>
        <p className="mt-2 text-sm text-muted">No comparable snapshot history yet.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="snapshot-timeline-heading" className="flex flex-col gap-3" data-testid="snapshot-timeline">
      <h2 id="snapshot-timeline-heading" className="text-lg font-semibold">
        Snapshot timeline
      </h2>
      <ol className="flex flex-col gap-2">
        {timeline.map((snapshot) => (
          <li
            key={snapshot.snapshotId}
            className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-muted">{snapshot.fetchedAt}</span>
            <span className="font-mono text-xs text-subtle">{snapshot.contentHash.slice(0, 16)}…</span>
            <span className="text-xs text-subtle">HTTP {snapshot.fetch.httpStatus ?? "—"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
