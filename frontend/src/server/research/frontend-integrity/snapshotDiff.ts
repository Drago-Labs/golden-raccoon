import type { SecurityHeaders, Snapshot, SnapshotDiff } from "./schema";

const HEADER_NAMES: (keyof SecurityHeaders)[] = ["csp", "hsts", "frame", "referrer"];

export function diffSnapshots(previous: Snapshot | null, current: Snapshot): SnapshotDiff {
  if (!previous) return { added: [], removed: [], headerChanges: [] };
  const previousHashes = new Set(previous.scripts.map((script) => script.sha256));
  const currentHashes = new Set(current.scripts.map((script) => script.sha256));
  return {
    added: current.scripts.filter((script) => !previousHashes.has(script.sha256)),
    removed: previous.scripts.filter((script) => !currentHashes.has(script.sha256)),
    headerChanges: HEADER_NAMES.flatMap((name) => {
      const before = previous.headers[name];
      const after = current.headers[name];
      return before === after ? [] : [{ name, before, after }];
    }),
  };
}
