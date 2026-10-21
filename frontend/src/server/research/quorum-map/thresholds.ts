import type { QuorumSetNode } from "./schema";

function votes(set: QuorumSetNode, agrees: (key: string) => boolean): number {
  const direct = set.validators.filter((key) => agrees(key)).length;
  const inner = set.innerSets.filter((innerSet) => votes(innerSet, agrees) >= innerSet.threshold).length;
  return direct + inner;
}

/** A slice agrees when agreeing validators plus agreeing inner sets reach its threshold. */
export function sliceAgrees(set: QuorumSetNode, agrees: (key: string) => boolean): boolean {
  return votes(set, agrees) >= set.threshold;
}

/**
 * True when the slice no longer reaches its threshold if every validator in `organization` is removed.
 * Validators with no organization still count. This is not a quorum-intersection proof.
 */
export function removalBreaks(set: QuorumSetNode, organization: string, organizationOf: (key: string) => string | null): boolean {
  return !sliceAgrees(set, (key) => organizationOf(key) !== organization);
}
