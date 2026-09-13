/**
 * Public entry point for watchlist collections, tags and saved views.
 *
 * Every command carries its owner, and every command is validated before it
 * reaches a repository. The service never trusts an id: an id the caller does
 * not own produces `not_found` — indistinguishable from an id that does not
 * exist, so a caller cannot probe for another wallet's records.
 *
 * The watchlist itself is read-only here. This feature adds metadata beside
 * watched assets; it never creates, changes or removes one.
 */
import { assertCollectionBudget, assertFreshRevision, buildCollection, nextPosition, sortCollections } from "./collections";
import { applyOrdering, buildMembership, findDuplicate, markMissingReferences, sortMemberships } from "./membership";
import { assertOwned, canonicalOwner } from "./ownership";
import { assertKnownIds, assertViewBudget, buildSavedView } from "./savedViews";
import { buildTag, findExistingTag } from "./tags";
import type { CollectionsRepository } from "./repository";
import {
  COLLECTIONS_SCHEMA_VERSION,
  COLLECTION_LIMITS,
  CollectionsError,
  collectionsCommandSchema,
  notFound,
  type Collection,
  type CollectionsSnapshot,
  type Membership,
  type OwnerScope,
  type SavedView,
  type Tag,
} from "./schema";

/**
 * Everything the service needs from outside itself.
 *
 * The clock and the id generator are injected so the same command produces the
 * same record in a test. `listWatchlistEntryIds` is the only window onto the
 * watchlist, and it is a read — there is no way from here to change one.
 */
export type CollectionsDependencies = {
  repository: CollectionsRepository;
  now: () => string;
  newId: (kind: string) => string;
  listWatchlistEntryIds: (owner: OwnerScope) => Promise<string[]> | string[];
};

export type CollectionsResult =
  | { kind: "snapshot"; snapshot: CollectionsSnapshot }
  | { kind: "collection"; collection: Collection; snapshot: CollectionsSnapshot }
  | { kind: "tag"; tag: Tag; snapshot: CollectionsSnapshot }
  | { kind: "membership"; membership: Membership; snapshot: CollectionsSnapshot }
  | { kind: "view"; view: SavedView; snapshot: CollectionsSnapshot }
  | { kind: "deleted"; deleted: Record<string, number | boolean>; snapshot: CollectionsSnapshot };

async function buildSnapshot(deps: CollectionsDependencies, owner: OwnerScope): Promise<CollectionsSnapshot> {
  const canonical = canonicalOwner(owner);
  const stored = await deps.repository.snapshot(canonical);
  const liveEntryIds = new Set(await deps.listWatchlistEntryIds(canonical));
  const memberships = sortMemberships(markMissingReferences(stored.memberships, liveEntryIds));
  const missingReferenceCount = memberships.filter((membership) => membership.referenceMissing).length;

  const empty =
    stored.collections.length === 0 && stored.tags.length === 0 && memberships.length === 0 && stored.savedViews.length === 0;

  return {
    schemaVersion: COLLECTIONS_SCHEMA_VERSION,
    owner: canonical,
    collections: sortCollections(stored.collections),
    tags: [...stored.tags].sort((left, right) => left.normalized.localeCompare(right.normalized)),
    memberships,
    savedViews: [...stored.savedViews].sort((left, right) => left.name.localeCompare(right.name)),
    coverage: empty
      ? {
          state: "empty",
          note: "This wallet has no collections on this network yet. That is a successful result, not a failure.",
          missingReferenceCount: 0,
        }
      : missingReferenceCount > 0
        ? {
            state: "partial",
            note: `${missingReferenceCount} membership(s) point at a watchlist entry that no longer exists. They are shown rather than removed, so nothing disappears without being seen.`,
            missingReferenceCount,
          }
        : {
            state: "complete",
            note: "Every membership points at a watchlist entry that still exists.",
            missingReferenceCount: 0,
          },
    assetsUnchanged: true,
  };
}

export async function runCollectionsCommand(input: unknown, deps: CollectionsDependencies): Promise<CollectionsResult> {
  const parsed = collectionsCommandSchema.safeParse(input);

  if (!parsed.success) {
    throw new CollectionsError("invalid_request", "The collections command could not be read.", 400, parsed.error.flatten());
  }

  const command = parsed.data;
  const owner = canonicalOwner(command.owner);
  const snapshot = () => buildSnapshot(deps, owner);

  switch (command.action) {
    case "snapshot":
      return { kind: "snapshot", snapshot: await snapshot() };

    case "create_collection": {
      const stored = await deps.repository.snapshot(owner);

      assertCollectionBudget(stored.collections);

      const collection = buildCollection({
        id: deps.newId("collection"),
        owner,
        name: command.collection.name,
        description: command.collection.description,
        position: command.collection.position ?? nextPosition(stored.collections),
        now: deps.now(),
      });

      await deps.repository.insertCollection(collection);

      return { kind: "collection", collection, snapshot: await snapshot() };
    }

    case "update_collection": {
      const existing = assertOwned(await deps.repository.getCollection(owner, command.collection.id), owner, "collection");

      assertFreshRevision(existing.revision, command.collection.expectedRevision, "collection");

      const updated: Collection = {
        ...existing,
        name: command.collection.name?.trim() || existing.name,
        description:
          command.collection.description === undefined
            ? existing.description
            : command.collection.description === null || command.collection.description.trim().length === 0
              ? null
              : command.collection.description.trim(),
        position: command.collection.position ?? existing.position,
        updatedAt: deps.now(),
        revision: existing.revision + 1,
      };

      await deps.repository.updateCollection(updated);

      return { kind: "collection", collection: updated, snapshot: await snapshot() };
    }

    case "delete_collection": {
      assertOwned(await deps.repository.getCollection(owner, command.collectionId), owner, "collection");

      // Removes the collection and its memberships. The watched assets behind
      // those memberships stay in the watchlist, untouched.
      const result = await deps.repository.deleteCollection(owner, command.collectionId);

      return { kind: "deleted", deleted: { ...result, assetsRemoved: 0 }, snapshot: await snapshot() };
    }

    case "create_tag": {
      const stored = await deps.repository.snapshot(owner);
      const existing = findExistingTag(stored.tags, command.tag.label);

      // A label that normalizes onto an existing tag *is* that tag. Creating a
      // second row would give the user two entries that look identical.
      if (existing) {
        return { kind: "tag", tag: existing, snapshot: await snapshot() };
      }

      if (stored.tags.length >= COLLECTION_LIMITS.maxTagsPerWallet) {
        throw new CollectionsError("tag_limit_reached", `A wallet may hold at most ${COLLECTION_LIMITS.maxTagsPerWallet} tags.`, 409);
      }

      const tag = buildTag({ id: deps.newId("tag"), owner, label: command.tag.label, createdAt: deps.now() });

      await deps.repository.insertTag(tag);

      return { kind: "tag", tag, snapshot: await snapshot() };
    }

    case "delete_tag": {
      const stored = await deps.repository.snapshot(owner);

      if (!stored.tags.some((tag) => tag.id === command.tagId)) {
        throw notFound("tag");
      }

      const result = await deps.repository.deleteTag(owner, command.tagId);

      return { kind: "deleted", deleted: { ...result }, snapshot: await snapshot() };
    }

    case "add_membership": {
      const stored = await deps.repository.snapshot(owner);

      assertOwned(
        stored.collections.find((collection) => collection.id === command.membership.collectionId),
        owner,
        "collection",
      );

      const duplicate = findDuplicate(stored.memberships, command.membership.collectionId, command.membership.watchlistEntryId);

      // Adding the same entry twice returns the membership that exists. It is
      // what a user who clicks twice means, and it keeps the invariant that an
      // entry appears in a collection at most once.
      if (duplicate) {
        return { kind: "membership", membership: duplicate, snapshot: await snapshot() };
      }

      const liveEntryIds = new Set(await deps.listWatchlistEntryIds(owner));

      if (!liveEntryIds.has(command.membership.watchlistEntryId)) {
        throw notFound("watchlist entry");
      }

      assertKnownIds({
        requested: command.membership.tagIds ?? [],
        known: new Set(stored.tags.map((tag) => tag.id)),
        kind: "tags",
      });

      const inCollection = stored.memberships.filter((membership) => membership.collectionId === command.membership.collectionId);

      if (inCollection.length >= COLLECTION_LIMITS.maxMembershipsPerCollection) {
        throw new CollectionsError(
          "membership_limit_reached",
          `A collection may hold at most ${COLLECTION_LIMITS.maxMembershipsPerCollection} entries.`,
          409,
        );
      }

      const membership = buildMembership({
        id: deps.newId("membership"),
        owner,
        collectionId: command.membership.collectionId,
        watchlistEntryId: command.membership.watchlistEntryId,
        tagIds: command.membership.tagIds ?? [],
        position: command.membership.position ?? nextPosition(inCollection),
        now: deps.now(),
      });

      await deps.repository.insertMembership(membership);

      return { kind: "membership", membership, snapshot: await snapshot() };
    }

    case "remove_membership": {
      const stored = await deps.repository.snapshot(owner);
      const existing = stored.memberships.find((membership) => membership.id === command.membershipId);

      assertOwned(existing, owner, "membership");

      const removed = await deps.repository.deleteMembership(owner, command.membershipId);

      return { kind: "deleted", deleted: { membership: removed, assetsRemoved: 0 }, snapshot: await snapshot() };
    }

    case "reorder_memberships": {
      const stored = await deps.repository.snapshot(owner);

      assertOwned(
        stored.collections.find((collection) => collection.id === command.reorder.collectionId),
        owner,
        "collection",
      );

      const inCollection = stored.memberships.filter((membership) => membership.collectionId === command.reorder.collectionId);
      const reordered = applyOrdering(inCollection, command.reorder.orderedMembershipIds);

      await deps.repository.replaceMembershipOrder(owner, command.reorder.collectionId, reordered);

      return { kind: "deleted", deleted: { reordered: reordered.length }, snapshot: await snapshot() };
    }

    case "save_view": {
      const stored = await deps.repository.snapshot(owner);
      const existing = command.view.id ? stored.savedViews.find((view) => view.id === command.view.id) : undefined;

      if (command.view.id && !existing) {
        throw notFound("saved view");
      }

      if (existing) {
        assertFreshRevision(existing.revision, command.view.expectedRevision, "saved view");
      } else {
        assertViewBudget(stored.savedViews);
      }

      assertKnownIds({
        requested: command.view.collectionIds,
        known: new Set(stored.collections.map((collection) => collection.id)),
        kind: "collections",
      });
      assertKnownIds({
        requested: command.view.tagIds,
        known: new Set(stored.tags.map((tag) => tag.id)),
        kind: "tags",
      });

      const now = deps.now();
      const view = buildSavedView({
        id: existing?.id ?? deps.newId("view"),
        owner,
        name: command.view.name,
        collectionIds: command.view.collectionIds,
        tagIds: command.view.tagIds,
        search: command.view.search ?? null,
        sort: command.view.sort,
        createdAt: existing?.createdAt ?? now,
        now,
        revision: (existing?.revision ?? 0) + 1,
      });

      await deps.repository.upsertSavedView(view);

      return { kind: "view", view, snapshot: await snapshot() };
    }

    case "delete_view": {
      const stored = await deps.repository.snapshot(owner);

      if (!stored.savedViews.some((view) => view.id === command.viewId)) {
        throw notFound("saved view");
      }

      const removed = await deps.repository.deleteSavedView(owner, command.viewId);

      return { kind: "deleted", deleted: { view: removed }, snapshot: await snapshot() };
    }
  }
}

/**
 * The privacy hook.
 *
 * Called from the wallet erasure path. It removes this feature's metadata for
 * one wallet and network and reports the counts; it touches no watchlist
 * entry, no scan history and no asset identity, so an erasure cannot take a
 * shared record with it.
 */
export async function eraseCollectionMetadata(
  owner: OwnerScope,
  repository: CollectionsRepository,
): Promise<{ collections: number; tags: number; memberships: number; savedViews: number }> {
  return repository.eraseOwner(canonicalOwner(owner));
}

/**
 * The export hook.
 *
 * Returns exactly what a wallet's collection metadata contains, in the shape
 * the snapshot uses, so a data export carries the same records the UI shows.
 */
export async function exportCollectionMetadata(
  owner: OwnerScope,
  deps: CollectionsDependencies,
): Promise<CollectionsSnapshot> {
  return buildSnapshot(deps, owner);
}

export { CollectionsError } from "./schema";
export type { CollectionsSnapshot } from "./schema";
