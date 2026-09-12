/**
 * Saved views: a named filter over the caller's own collections and tags.
 *
 * Every id in a filter is checked against the caller's own records before the
 * view is stored. A view that could reference another wallet's collection id
 * would be a way to probe for one; a view that references an id that never
 * existed would fail silently later, when the user cannot see why.
 */
import { COLLECTION_LIMITS, CollectionsError, type OwnerScope, type SavedView } from "./schema";
import { canonicalOwner } from "./ownership";

export function assertKnownIds(input: {
  requested: string[];
  known: Set<string>;
  kind: string;
}): void {
  const unknown = input.requested.filter((id) => !input.known.has(id));

  if (unknown.length > 0) {
    throw new CollectionsError("unknown_reference", `The view names ${input.kind} that do not belong to this wallet and network.`, 409, {
      unknown,
    });
  }
}

export function buildSavedView(input: {
  id: string;
  owner: OwnerScope;
  name: string;
  collectionIds: string[];
  tagIds: string[];
  search: string | null;
  sort: SavedView["filter"]["sort"];
  createdAt: string;
  now: string;
  revision: number;
}): SavedView {
  const name = input.name.trim();

  if (name.length === 0) {
    throw new CollectionsError("invalid_view", "A saved view needs a name.");
  }

  return {
    id: input.id,
    owner: canonicalOwner(input.owner),
    name,
    filter: {
      // Duplicates collapse: filtering by the same collection twice is
      // filtering by it once.
      collectionIds: [...new Set(input.collectionIds)],
      tagIds: [...new Set(input.tagIds)],
      search: input.search && input.search.trim().length > 0 ? input.search.trim() : null,
      sort: input.sort,
    },
    createdAt: input.createdAt,
    updatedAt: input.now,
    revision: input.revision,
  };
}

export function assertViewBudget(existing: SavedView[]): void {
  if (existing.length >= COLLECTION_LIMITS.maxSavedViewsPerWallet) {
    throw new CollectionsError("view_limit_reached", `A wallet may hold at most ${COLLECTION_LIMITS.maxSavedViewsPerWallet} saved views.`, 409);
  }
}
