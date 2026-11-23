import { FRONTEND_INTEGRITY_LIMITS } from "./limits";
import type { Snapshot } from "./schema";

/** In-memory history for one process. Tests pass their own store so nothing leaks between cases. */
export function createSnapshotStore() {
  const rows: Snapshot[] = [];
  return {
    save(snapshot: Snapshot) {
      rows.push(snapshot);
      if (rows.length > FRONTEND_INTEGRITY_LIMITS.maxSnapshots) rows.shift();
    },
    list(domain: string) {
      return rows.filter((row) => row.domain === domain);
    },
    previous(domain: string) {
      const matches = rows.filter((row) => row.domain === domain);
      return matches.length > 0 ? matches[matches.length - 1] : null;
    },
  };
}
