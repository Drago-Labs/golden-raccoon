import { splitParagraphs, splitSentences } from "./textExtraction";
import { POLICY_CHANGE_LIMITS } from "./limits";
import type { PolicySnapshot, SnapshotDiff, SnapshotDiffRow } from "./schema";

/**
 * Diffs two snapshots' text at paragraph level, then at sentence level
 * within any paragraph that changed — so a one-word edit inside a long
 * paragraph is visible, not buried in a wall of "changed: true".
 */
export function diffSnapshots(from: PolicySnapshot, to: PolicySnapshot, fromText: string, toText: string): SnapshotDiff {
  if (from.contentHash === to.contentHash) {
    return {
      fromSnapshotId: from.snapshotId,
      toSnapshotId: to.snapshotId,
      fromFetchedAt: from.fetchedAt,
      toFetchedAt: to.fetchedAt,
      contentUnchanged: true,
      rows: [],
    };
  }

  const fromParagraphs = splitParagraphs(fromText);
  const toParagraphs = splitParagraphs(toText);
  const rows: SnapshotDiffRow[] = [];

  const paragraphCount = Math.max(fromParagraphs.length, toParagraphs.length);
  for (let index = 0; index < paragraphCount && rows.length < POLICY_CHANGE_LIMITS.maxDiffRows; index += 1) {
    const previousParagraph = fromParagraphs[index] ?? null;
    const currentParagraph = toParagraphs[index] ?? null;
    const paragraphChanged = previousParagraph !== currentParagraph;

    rows.push({ unit: "paragraph", index, previousText: previousParagraph, currentText: currentParagraph, changed: paragraphChanged });

    if (paragraphChanged && previousParagraph && currentParagraph) {
      const previousSentences = splitSentences(previousParagraph);
      const currentSentences = splitSentences(currentParagraph);
      const sentenceCount = Math.max(previousSentences.length, currentSentences.length);

      for (let sentenceIndex = 0; sentenceIndex < sentenceCount && rows.length < POLICY_CHANGE_LIMITS.maxDiffRows; sentenceIndex += 1) {
        const previousSentence = previousSentences[sentenceIndex] ?? null;
        const currentSentence = currentSentences[sentenceIndex] ?? null;
        if (previousSentence === currentSentence) continue;

        rows.push({
          unit: "sentence",
          index: sentenceIndex,
          previousText: previousSentence,
          currentText: currentSentence,
          changed: true,
        });
      }
    }
  }

  return {
    fromSnapshotId: from.snapshotId,
    toSnapshotId: to.snapshotId,
    fromFetchedAt: from.fetchedAt,
    toFetchedAt: to.fetchedAt,
    contentUnchanged: false,
    rows,
  };
}

/** Builds every consecutive-pair diff across a timeline, oldest to newest. */
export function buildTimelineDiffs(
  timeline: PolicySnapshot[],
  textBySnapshotId: Map<string, string>,
): SnapshotDiff[] {
  const diffs: SnapshotDiff[] = [];
  for (let i = 1; i < timeline.length; i += 1) {
    const from = timeline[i - 1];
    const to = timeline[i];
    const fromText = textBySnapshotId.get(from.snapshotId) ?? "";
    const toText = textBySnapshotId.get(to.snapshotId) ?? "";
    diffs.push(diffSnapshots(from, to, fromText, toText));
  }
  return diffs;
}

export function sortTimeline(snapshots: PolicySnapshot[]): PolicySnapshot[] {
  return [...snapshots].sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt));
}
