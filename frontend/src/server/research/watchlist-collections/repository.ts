/**
 * The repository port, and the contract both implementations must satisfy.
 *
 * Every method takes an `OwnerScope`. That is not a convention — it is the
 * ownership boundary: a repository has no method that can reach a record
 * without naming its owner, so "wallet A reads wallet B's collection" is not
 * an access-control bug waiting to be introduced, it is a call that cannot be
 * written.
 *
 * Membership changes are transactional. Adding a membership touches two rows
 * (the membership and the collection's `updatedAt`/`revision`), and a reorder
 * touches every membership in a collection; a partial apply would leave an
 * ordering that means nothing.
 */
import type { Collection, Membership, OwnerScope, SavedView, Tag } from "./schema";

export type CollectionsRepository = {
  /** Everything the owner has, in one read. */
  snapshot(owner: OwnerScope): Promise<{
    collections: Collection[];
    tags: Tag[];
    memberships: Membership[];
    savedViews: SavedView[];
  }>;

  getCollection(owner: OwnerScope, id: string): Promise<Collection | null>;
  insertCollection(collection: Collection): Promise<Collection>;
  updateCollection(collection: Collection): Promise<Collection>;
  /** Removes the collection and its memberships. Watched assets are untouched. */
  deleteCollection(owner: OwnerScope, id: string): Promise<{ deletedMemberships: number }>;

  insertTag(tag: Tag): Promise<Tag>;
  /** Removes the tag and detaches it from every membership that carried it. */
  deleteTag(owner: OwnerScope, id: string): Promise<{ detachedFrom: number }>;

  insertMembership(membership: Membership): Promise<Membership>;
  deleteMembership(owner: OwnerScope, id: string): Promise<boolean>;
  /** Applies a whole ordering in one transaction. */
  replaceMembershipOrder(owner: OwnerScope, collectionId: string, ordered: Membership[]): Promise<Membership[]>;

  upsertSavedView(view: SavedView): Promise<SavedView>;
  deleteSavedView(owner: OwnerScope, id: string): Promise<boolean>;

  /**
   * Removes every collection record owned by this wallet.
   *
   * This is the hook the privacy erasure path calls. It deletes metadata only:
   * no watchlist entry, no scan history and no asset identity is touched, so a
   * wallet erasure cannot take a shared asset record with it.
   */
  eraseOwner(owner: OwnerScope): Promise<{ collections: number; tags: number; memberships: number; savedViews: number }>;
};
