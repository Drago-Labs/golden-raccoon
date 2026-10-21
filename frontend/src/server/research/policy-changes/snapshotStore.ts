import { POLICY_CHANGE_LIMITS } from "./limits";
import { sortTimeline } from "./diff";
import type { PolicySnapshot } from "./schema";

/**
 * Feature-local "store" for prior snapshots.
 *
 * This feature keeps no server-side database: the caller (the workbench UI)
 * holds prior snapshots in session state and sends them back on each
 * request, exactly like `server/research/metadata-integrity`'s
 * `priorObservations`. This module only filters and orders what the caller
 * already sent — "storing" a snapshot means returning it to the caller to
 * hold, not writing it anywhere server-side.
 */
export function filterPriorForProject(prior: PolicySnapshot[], projectId: string): PolicySnapshot[] {
  return prior.filter((snapshot) => snapshot.projectId === projectId).slice(0, POLICY_CHANGE_LIMITS.maxPriorSnapshots);
}

export function appendSnapshot(prior: PolicySnapshot[], current: PolicySnapshot): PolicySnapshot[] {
  if (prior.some((snapshot) => snapshot.contentHash === current.contentHash)) {
    // Unchanged content creates no new version — see the README.
    return sortTimeline(prior);
  }
  return sortTimeline([...prior, current]);
}
