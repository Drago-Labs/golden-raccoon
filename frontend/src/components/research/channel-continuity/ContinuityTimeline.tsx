"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ContinuityEvent } from "@/server/research/channel-continuity/schema";

/**
 * Accessible continuity timeline.
 *
 * Events are listed chronologically as evidence. Undated rows stay labelled
 * rather than being placed at the present moment.
 */
export function ContinuityTimeline({ events }: { events: ContinuityEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No continuity events were derived from the supplied observations.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="continuity-timeline">
      {events.map((event) => (
        <li key={event.eventId} className="rounded-xl border border-white/10 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">{event.kind.replace(/_/g, " ")}</StatusBadge>
            <time className="font-mono text-xs text-subtle" dateTime={event.observedAt ?? undefined}>
              {event.observedAt ?? "Undated"}
            </time>
          </div>
          <p className="mt-2">{event.detail}</p>
          <p className="mt-1 text-xs text-subtle">
            <span className="font-medium">This does not establish:</span> {event.limitation}
          </p>
        </li>
      ))}
    </ol>
  );
}
