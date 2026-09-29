/**
 * Semantic matching of the narrative items in a snapshot.
 *
 * A snapshot carries two kinds of item a reader thinks of as "factors": the
 * `topReasons` prose list and the `missingData` markers. Neither is stable by
 * array position, and prose is not stable by exact string either, so matching
 * uses a normalized content fingerprint. When a fingerprint on one side could
 * match more than one item on the other, the pair is reported as `ambiguous`
 * instead of being guessed at.
 */
import type { RiskSnapshotDocument } from "@/server/snapshots/schema";
import type { ChangeStatus, FactorChange, MissingDataDelta } from "./schema";

/** Words that carry no discriminating meaning in a risk reason. */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "was",
  "were", "with",
]);

/**
 * Reduces a reason to a comparable fingerprint: lowercased, punctuation and
 * digits removed, stop words dropped, remaining words sorted. Rewording a
 * sentence changes the fingerprint; reordering the list does not.
 */
export function fingerprintReason(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  if (words.length === 0) return `literal:${text.trim().toLowerCase()}`;

  return [...new Set(words)].sort().join("-");
}

function groupByFingerprint(reasons: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const reason of reasons) {
    const key = fingerprintReason(reason);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(reason);
    else grouped.set(key, [reason]);
  }

  return grouped;
}

export function matchTopReasons(left: string[], right: string[]): FactorChange[] {
  const leftGroups = groupByFingerprint(left);
  const rightGroups = groupByFingerprint(right);
  const keys = [...new Set([...leftGroups.keys(), ...rightGroups.keys()])].sort();
  const changes: FactorChange[] = [];

  for (const key of keys) {
    const leftItems = leftGroups.get(key) ?? [];
    const rightItems = rightGroups.get(key) ?? [];

    if (leftItems.length > 1 || rightItems.length > 1) {
      changes.push({
        key,
        kind: "top_reason",
        status: "ambiguous",
        leftText: leftItems[0] ?? null,
        rightText: rightItems[0] ?? null,
        candidates: [...leftItems, ...rightItems],
        note: "More than one reason shares this fingerprint, so a one-to-one match cannot be established. Both sides are shown unmatched.",
      });
      continue;
    }

    const leftText = leftItems[0] ?? null;
    const rightText = rightItems[0] ?? null;

    let status: ChangeStatus;
    let note: string;

    if (leftText === null) {
      status = "added";
      note = "This reason appears only in the later observation.";
    } else if (rightText === null) {
      status = "removed";
      note = "This reason appears only in the earlier observation. It may have been resolved, or it may simply no longer be reported.";
    } else if (leftText === rightText) {
      status = "unchanged";
      note = "Present in both observations with identical wording.";
    } else {
      status = "changed";
      note = "Present in both observations with different wording for the same underlying reason.";
    }

    changes.push({ key, kind: "top_reason", status, leftText, rightText, note });
  }

  return changes;
}

export function matchMissingData(
  left: RiskSnapshotDocument["missingData"],
  right: RiskSnapshotDocument["missingData"],
): MissingDataDelta[] {
  const leftByField = new Map(left.map((entry) => [entry.field, entry.impact]));
  const rightByField = new Map(right.map((entry) => [entry.field, entry.impact]));
  const fields = [...new Set([...leftByField.keys(), ...rightByField.keys()])].sort();

  return fields.map((field) => {
    const leftImpact = leftByField.get(field) ?? null;
    const rightImpact = rightByField.get(field) ?? null;

    if (leftImpact === null) {
      return {
        field,
        status: "added" as const,
        leftImpact,
        rightImpact,
        note: "This data became unavailable between the two observations. Visibility decreased; risk did not necessarily change.",
      };
    }

    if (rightImpact === null) {
      return {
        field,
        status: "removed" as const,
        leftImpact,
        rightImpact,
        note: "This gap is no longer reported. The data became available again, or the report stopped tracking it.",
      };
    }

    if (leftImpact === rightImpact) {
      return {
        field,
        status: "unchanged" as const,
        leftImpact,
        rightImpact,
        note: "The gap persists at the same declared impact.",
      };
    }

    return {
      field,
      status: "changed" as const,
      leftImpact,
      rightImpact,
      note: `The declared impact of this gap moved from ${leftImpact} to ${rightImpact}.`,
    };
  });
}

/** Missing-data markers rendered as factor rows, for a single combined view. */
export function missingDataAsFactors(deltas: MissingDataDelta[]): FactorChange[] {
  return deltas.map((delta) => ({
    key: `missing:${delta.field}`,
    kind: "missing_data" as const,
    status: delta.status,
    leftText: delta.leftImpact === null ? null : `${delta.field} (${delta.leftImpact} impact)`,
    rightText: delta.rightImpact === null ? null : `${delta.field} (${delta.rightImpact} impact)`,
    note: delta.note,
  }));
}
