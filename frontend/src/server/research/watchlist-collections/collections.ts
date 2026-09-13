/**
 * Collection ordering and naming rules.
 *
 * Ordering is manual and explicit: a collection carries a `position`, and ties
 * break by creation time so the order is total and stable. An order that
 * depends on insertion order alone would shuffle when a repository changed how
 * it iterates.
 */
import { COLLECTION_LIMITS, CollectionsError, type Collection, type OwnerScope } from "./schema";
import { canonicalOwner } from "./ownership";

export function sortCollections(collections: Collection[]): Collection[] {
  return [...collections].sort(
    (left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
}

/** The position a new collection takes: after everything that exists. */
export function nextPosition(existing: Array<{ position: number }>): number {
  return existing.reduce((highest, entry) => Math.max(highest, entry.position), -1) + 1;
}

export function buildCollection(input: {
  id: string;
  owner: OwnerScope;
  name: string;
  description?: string;
  position: number;
  now: string;
}): Collection {
  const name = input.name.trim();

  if (name.length === 0) {
    throw new CollectionsError("invalid_collection", "A collection needs a name.");
  }

  return {
    id: input.id,
    owner: canonicalOwner(input.owner),
    name,
    description: input.description?.trim() ? input.description.trim() : null,
    position: input.position,
    createdAt: input.now,
    updatedAt: input.now,
    revision: 1,
  };
}

export function assertCollectionBudget(existing: Collection[]): void {
  if (existing.length >= COLLECTION_LIMITS.maxCollectionsPerWallet) {
    throw new CollectionsError(
      "collection_limit_reached",
      `A wallet may hold at most ${COLLECTION_LIMITS.maxCollectionsPerWallet} collections.`,
      409,
    );
  }
}

/**
 * Refuses a write whose base revision is stale.
 *
 * Two tabs editing the same collection must not silently merge: the second
 * write is told what it missed rather than overwriting it.
 */
export function assertFreshRevision(current: number, expected: number | undefined, kind: string): void {
  if (expected !== undefined && expected !== current) {
    throw new CollectionsError(
      "stale_revision",
      `This ${kind} changed since it was read. Reload it and apply the change again.`,
      409,
      { currentRevision: current, expectedRevision: expected },
    );
  }
}
