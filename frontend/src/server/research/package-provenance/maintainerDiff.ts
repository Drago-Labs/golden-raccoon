/**
 * Diffs maintainer sets across consecutive releases.
 *
 * A change is attributed to the release where the new set first takes
 * effect, not the one before it. A release pair where either side has no
 * maintainer snapshot (crates.io) produces no claim at all — this module
 * never infers a change from registries that do not expose the data.
 */
import { PACKAGE_PROVENANCE_LIMITS } from "./limits";
import type { UnifiedRelease } from "./releaseHistory";
import type { MaintainerChange } from "./schema";

/** `releasesOldestFirst` must be sorted oldest to newest. */
export function diffMaintainers(releasesOldestFirst: UnifiedRelease[]): MaintainerChange[] {
  const changes: MaintainerChange[] = [];

  for (let i = 1; i < releasesOldestFirst.length; i++) {
    const previous = releasesOldestFirst[i - 1];
    const current = releasesOldestFirst[i];
    if (previous.maintainers === null || current.maintainers === null) continue;

    const previousSet = new Set(previous.maintainers);
    const currentSet = new Set(current.maintainers);
    const added = current.maintainers.filter((name) => !previousSet.has(name));
    const removed = previous.maintainers.filter((name) => !currentSet.has(name));

    if (added.length > 0 || removed.length > 0) {
      changes.push({ fromVersion: previous.version, toVersion: current.version, added, removed });
    }
  }

  return changes.slice(-PACKAGE_PROVENANCE_LIMITS.maxMaintainerChanges);
}
