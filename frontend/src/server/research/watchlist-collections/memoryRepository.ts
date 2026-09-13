/**
 * In-memory repository.
 *
 * Used in tests and where no database is configured. It is written to behave
 * exactly as the PostgreSQL implementation does — the conformance suite runs
 * the same cases against both — which means it copies on read and on write.
 *
 * Copying matters: handing a caller the stored object would let an accidental
 * mutation change the store without going through a write, and the resulting
 * bug would not reproduce against PostgreSQL.
 */
import { ownerKey } from "./ownership";
import type { CollectionsRepository } from "./repository";
import type { Collection, Membership, OwnerScope, SavedView, Tag } from "./schema";

type OwnerBucket = {
  collections: Map<string, Collection>;
  tags: Map<string, Tag>;
  memberships: Map<string, Membership>;
  savedViews: Map<string, SavedView>;
};

function emptyBucket(): OwnerBucket {
  return { collections: new Map(), tags: new Map(), memberships: new Map(), savedViews: new Map() };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createMemoryCollectionsRepository(): CollectionsRepository {
  const buckets = new Map<string, OwnerBucket>();

  function bucketFor(owner: OwnerScope): OwnerBucket {
    const key = ownerKey(owner);
    const existing = buckets.get(key);

    if (existing) return existing;

    const created = emptyBucket();
    buckets.set(key, created);

    return created;
  }

  return {
    async snapshot(owner) {
      const bucket = bucketFor(owner);

      return {
        collections: [...bucket.collections.values()].map(clone),
        tags: [...bucket.tags.values()].map(clone),
        memberships: [...bucket.memberships.values()].map(clone),
        savedViews: [...bucket.savedViews.values()].map(clone),
      };
    },

    async getCollection(owner, id) {
      const found = bucketFor(owner).collections.get(id);

      return found ? clone(found) : null;
    },

    async insertCollection(collection) {
      bucketFor(collection.owner).collections.set(collection.id, clone(collection));

      return clone(collection);
    },

    async updateCollection(collection) {
      bucketFor(collection.owner).collections.set(collection.id, clone(collection));

      return clone(collection);
    },

    async deleteCollection(owner, id) {
      const bucket = bucketFor(owner);
      let deletedMemberships = 0;

      for (const [membershipId, membership] of bucket.memberships) {
        if (membership.collectionId === id) {
          bucket.memberships.delete(membershipId);
          deletedMemberships += 1;
        }
      }

      // Saved views that referenced the collection keep working: the id simply
      // stops matching. Rewriting a user's saved view as a side effect of a
      // delete would be a surprise they never asked for.
      bucket.collections.delete(id);

      return { deletedMemberships };
    },

    async insertTag(tag) {
      bucketFor(tag.owner).tags.set(tag.id, clone(tag));

      return clone(tag);
    },

    async deleteTag(owner, id) {
      const bucket = bucketFor(owner);
      let detachedFrom = 0;

      for (const [membershipId, membership] of bucket.memberships) {
        if (membership.tagIds.includes(id)) {
          bucket.memberships.set(membershipId, { ...clone(membership), tagIds: membership.tagIds.filter((tagId) => tagId !== id) });
          detachedFrom += 1;
        }
      }

      bucket.tags.delete(id);

      return { detachedFrom };
    },

    async insertMembership(membership) {
      bucketFor(membership.owner).memberships.set(membership.id, clone(membership));

      return clone(membership);
    },

    async deleteMembership(owner, id) {
      return bucketFor(owner).memberships.delete(id);
    },

    async replaceMembershipOrder(owner, collectionId, ordered) {
      const bucket = bucketFor(owner);

      // Applied as one step, like the PostgreSQL transaction: either every
      // position moves or none does.
      for (const membership of ordered) {
        if (membership.collectionId !== collectionId) continue;

        bucket.memberships.set(membership.id, clone(membership));
      }

      return ordered.map(clone);
    },

    async upsertSavedView(view) {
      bucketFor(view.owner).savedViews.set(view.id, clone(view));

      return clone(view);
    },

    async deleteSavedView(owner, id) {
      return bucketFor(owner).savedViews.delete(id);
    },

    async eraseOwner(owner) {
      const bucket = bucketFor(owner);
      const counts = {
        collections: bucket.collections.size,
        tags: bucket.tags.size,
        memberships: bucket.memberships.size,
        savedViews: bucket.savedViews.size,
      };

      buckets.delete(ownerKey(owner));

      return counts;
    },
  };
}
