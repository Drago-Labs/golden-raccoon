/**
 * Whether two runs are worth comparing at all.
 *
 * A comparison between runs about different tokens, or in different modes, is
 * technically possible and almost always misleading. Rather than refusing it,
 * the report labels it — the user may have a reason — and the label travels
 * with every number so a difference is never read as a change.
 */
import type { NormalizedRun } from "./runReader";
import type { Comparability } from "./schema";

export function assessComparability(left: NormalizedRun, right: NormalizedRun): { comparability: Comparability; note: string } {
  if (left.header.subjectKey !== null && right.header.subjectKey !== null && left.header.subjectKey !== right.header.subjectKey) {
    return {
      comparability: "different_subject",
      note: "These runs are about different assets. Differences below are differences between two subjects, not changes over time.",
    };
  }

  if (left.header.mode !== null && right.header.mode !== null && left.header.mode !== right.header.mode) {
    return {
      comparability: "different_mode",
      note: "These runs were made in different modes, which changes which agents run and what they are asked. Differences are not like-for-like.",
    };
  }

  if (left.results.length === 0 && right.results.length === 0) {
    return {
      comparability: "incomparable",
      note: "Neither run stored any agent result, so there is nothing to align.",
    };
  }

  const ordered = left.header.createdAt <= right.header.createdAt;

  return {
    comparability: "comparable",
    note: ordered
      ? "These runs are about the same subject in the same mode, so differences below are changes between them — though what caused a change is not recorded."
      : "These runs are comparable, but the run shown on the left is the more recent of the two.",
  };
}
