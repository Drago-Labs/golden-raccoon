/**
 * Membership rules: duplicates, ordering and dangling references.
 *
 * A watchlist entry appears in a collection at most once. Adding it again is
 * not an error and not a second row — it is the same membership, which is what
 * a user who clicks twice means. Removing a membership removes only the
 * metadata; the watched asset is untouched, which is the whole point of
 * keeping identity in the watchlist.
 */
import { COLLECTION_LIMITS, CollectionsError, type Membership, type OwnerScope } from "./schema";
import { canonicalOwner } from "./ownership";

export function findDuplicate(memberships: Membership[], collectionId: string, watchlistEntryId: string): Membership | undefined {
  return memberships.find(
    (membership) => membership.collectionId === collectionId && membership.watchlistEntryId === watchlistEntryId,
  );
}

export function buildMembership(input: {
  id: string;
  owner: OwnerScope;
  collectionId: string;
  watchlistEntryId: string;
  tagIds: string[];
  position: number;
  now: string;
}): Membership {
  // Duplicate tag ids on one membership collapse: tagging something "defi"
  // twice is tagging it once.
  const tagIds = [...new Set(input.tagIds)];

  if (tagIds.length > COLLECTION_LIMITS.maxTagsPerMembership) {
    throw new CollectionsError("too_many_tags", `A membership may carry at most ${COLLECTION_LIMITS.maxTagsPerMembership} tags.`);
  }

  return {
    id: input.id,
    owner: canonicalOwner(input.owner),
    collectionId: input.collectionId,
    watchlistEntryId: input.watchlistEntryId,
    position: input.position,
    tagIds,
    addedAt: input.now,
    referenceMissing: false,
  };
}

export function sortMemberships(memberships: Membership[]): Membership[] {
  return [...memberships].sort(
    (left, right) => left.position - right.position || left.addedAt.localeCompare(right.addedAt) || left.id.localeCompare(right.id),
  );
}

/**
 * Applies a full reordering.
 *
 * The caller must name every membership in the collection. A partial list
 * would leave the unnamed ones at positions that no longer mean anything, so
 * it is refused rather than guessed at.
 */
export function applyOrdering(memberships: Membership[], orderedIds: string[]): Membership[] {
  const byId = new Map(memberships.map((membership) => [membership.id, membership]));

  if (orderedIds.length !== memberships.length) {
    throw new CollectionsError(
      "incomplete_ordering",
      "A reorder must list every membership in the collection, so no item is left at a position that no longer means anything.",
      409,
      { expected: memberships.length, received: orderedIds.length },
    );
  }

  const seen = new Set<string>();
  const reordered: Membership[] = [];

  orderedIds.forEach((id, index) => {
    const membership = byId.get(id);

    if (!membership) {
      throw new CollectionsError("unknown_membership", "The ordering names a membership that is not in this collection.", 409, { id });
    }

    if (seen.has(id)) {
      throw new CollectionsError("duplicate_in_ordering", "The ordering names the same membership twice.", 409, { id });
    }

    seen.add(id);
    reordered.push({ ...membership, position: index });
  });

  return reordered;
}

/**
 * Marks memberships whose watchlist entry has gone.
 *
 * The membership survives, flagged. A user who removed an asset from their
 * watchlist should see that their collection now has a gap, not find the row
 * quietly missing.
 */
export function markMissingReferences(memberships: Membership[], liveEntryIds: Set<string>): Membership[] {
  return memberships.map((membership) => ({
    ...membership,
    referenceMissing: !liveEntryIds.has(membership.watchlistEntryId),
  }));
}
