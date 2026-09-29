"use client";

import type { StatusTransition } from "@/server/research/incident-status/schema";

/**
 * Status transitions with supporting document ids.
 *
 * `officiallySupported` is only true when an independent official source backs
 * the step — a syndicated copy never raises that flag alone.
 */
export function TransitionList({ transitions }: { transitions: StatusTransition[] }) {
  if (transitions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No status transitions were derived.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="status-transitions">
      {transitions.map((transition) => (
        <li key={transition.transitionId} className="rounded-xl border border-white/10 px-4 py-3">
          <p className="text-sm font-medium">
            {transition.fromStatus ?? "∅"} → {transition.toStatus}
          </p>
          <p className="mt-1 text-xs text-subtle">{transition.at ?? "No timestamp"}</p>
          <p className="mt-1 text-xs text-subtle">{transition.note}</p>
          <p className="mt-1 text-xs text-subtle">
            Support: {transition.supportingDocumentIds.join(", ")}. Official:{" "}
            {transition.officiallySupported ? "yes" : "no"}.
          </p>
        </li>
      ))}
    </ol>
  );
}
