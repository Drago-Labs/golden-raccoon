import type { SnapshotDiff } from "@/server/research/frontend-integrity";
export function SnapshotDiffView({ diff }: { diff: SnapshotDiff }) {
  return (
    <section>
      <h2 className="font-medium">Diff</h2>
      <p>{diff.added.length} added, {diff.removed.length} removed, {diff.headerChanges.length} header changes.</p>
    </section>
  );
}
