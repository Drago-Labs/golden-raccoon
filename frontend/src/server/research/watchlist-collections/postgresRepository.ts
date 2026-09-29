/**
 * PostgreSQL repository.
 *
 * Every statement is parameterized — there is no string concatenation of a
 * caller value anywhere in this file — and every statement filters by
 * `wallet_address` and `network` in the same `where` clause that matches the
 * id. An id alone never addresses a row.
 *
 * Membership changes that touch more than one row run inside a transaction, so
 * a reorder either lands completely or not at all. A half-applied ordering
 * would leave rows at positions that mean nothing, and nothing would report it.
 */
import { canonicalOwner } from "./ownership";
import type { CollectionsRepository } from "./repository";
import type { Collection, Membership, OwnerScope, SavedView, Tag } from "./schema";

/** The narrow slice of a pg pool this repository needs. */
export type QueryablePool = {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }>;
};

type CollectionRow = {
  id: string;
  wallet_address: string;
  network: string;
  name: string;
  description: string | null;
  position: number | string;
  created_at: string | Date;
  updated_at: string | Date;
  revision: number | string;
};

type TagRow = {
  id: string;
  wallet_address: string;
  network: string;
  label: string;
  normalized: string;
  created_at: string | Date;
};

type MembershipRow = {
  id: string;
  wallet_address: string;
  network: string;
  collection_id: string;
  watchlist_entry_id: string;
  position: number | string;
  tag_ids: string[] | null;
  added_at: string | Date;
};

type SavedViewRow = {
  id: string;
  wallet_address: string;
  network: string;
  name: string;
  collection_ids: string[] | null;
  tag_ids: string[] | null;
  search: string | null;
  sort: string;
  created_at: string | Date;
  updated_at: string | Date;
  revision: number | string;
};

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    owner: { walletAddress: row.wallet_address, network: row.network },
    name: row.name,
    description: row.description,
    position: Number(row.position),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    revision: Number(row.revision),
  };
}

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    owner: { walletAddress: row.wallet_address, network: row.network },
    label: row.label,
    normalized: row.normalized,
    createdAt: iso(row.created_at),
  };
}

function toMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    owner: { walletAddress: row.wallet_address, network: row.network },
    collectionId: row.collection_id,
    watchlistEntryId: row.watchlist_entry_id,
    position: Number(row.position),
    tagIds: row.tag_ids ?? [],
    addedAt: iso(row.added_at),
    referenceMissing: false,
  };
}

function toSavedView(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    owner: { walletAddress: row.wallet_address, network: row.network },
    name: row.name,
    filter: {
      collectionIds: row.collection_ids ?? [],
      tagIds: row.tag_ids ?? [],
      search: row.search,
      sort: (row.sort as SavedView["filter"]["sort"]) ?? "manual",
    },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    revision: Number(row.revision),
  };
}

export function createPostgresCollectionsRepository(pool: QueryablePool): CollectionsRepository {
  /** Every query starts here: the owner is never optional. */
  function scope(owner: OwnerScope): [string, string] {
    const canonical = canonicalOwner(owner);

    return [canonical.walletAddress, canonical.network];
  }

  async function transaction<T>(run: () => Promise<T>): Promise<T> {
    await pool.query("BEGIN");

    try {
      const result = await run();
      await pool.query("COMMIT");

      return result;
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }

  return {
    async snapshot(owner) {
      const [wallet, network] = scope(owner);

      const [collections, tags, memberships, savedViews] = await Promise.all([
        pool.query(
          "SELECT * FROM watchlist_collections WHERE wallet_address = $1 AND network = $2 ORDER BY position, created_at, id",
          [wallet, network],
        ),
        pool.query("SELECT * FROM watchlist_collection_tags WHERE wallet_address = $1 AND network = $2 ORDER BY created_at, id", [
          wallet,
          network,
        ]),
        pool.query(
          "SELECT * FROM watchlist_collection_memberships WHERE wallet_address = $1 AND network = $2 ORDER BY position, added_at, id",
          [wallet, network],
        ),
        pool.query("SELECT * FROM watchlist_saved_views WHERE wallet_address = $1 AND network = $2 ORDER BY created_at, id", [
          wallet,
          network,
        ]),
      ]);

      return {
        collections: (collections.rows as CollectionRow[]).map(toCollection),
        tags: (tags.rows as TagRow[]).map(toTag),
        memberships: (memberships.rows as MembershipRow[]).map(toMembership),
        savedViews: (savedViews.rows as SavedViewRow[]).map(toSavedView),
      };
    },

    async getCollection(owner, id) {
      const [wallet, network] = scope(owner);
      const result = await pool.query(
        "SELECT * FROM watchlist_collections WHERE id = $1 AND wallet_address = $2 AND network = $3",
        [id, wallet, network],
      );

      const row = (result.rows as CollectionRow[])[0];

      return row ? toCollection(row) : null;
    },

    async insertCollection(collection) {
      const [wallet, network] = scope(collection.owner);

      await pool.query(
        `INSERT INTO watchlist_collections (id, wallet_address, network, name, description, position, created_at, updated_at, revision)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          collection.id,
          wallet,
          network,
          collection.name,
          collection.description,
          collection.position,
          collection.createdAt,
          collection.updatedAt,
          collection.revision,
        ],
      );

      return collection;
    },

    async updateCollection(collection) {
      const [wallet, network] = scope(collection.owner);

      await pool.query(
        `UPDATE watchlist_collections
            SET name = $4, description = $5, position = $6, updated_at = $7, revision = $8
          WHERE id = $1 AND wallet_address = $2 AND network = $3`,
        [
          collection.id,
          wallet,
          network,
          collection.name,
          collection.description,
          collection.position,
          collection.updatedAt,
          collection.revision,
        ],
      );

      return collection;
    },

    async deleteCollection(owner, id) {
      const [wallet, network] = scope(owner);

      return transaction(async () => {
        const memberships = await pool.query(
          "DELETE FROM watchlist_collection_memberships WHERE collection_id = $1 AND wallet_address = $2 AND network = $3",
          [id, wallet, network],
        );

        await pool.query("DELETE FROM watchlist_collections WHERE id = $1 AND wallet_address = $2 AND network = $3", [
          id,
          wallet,
          network,
        ]);

        return { deletedMemberships: memberships.rowCount ?? 0 };
      });
    },

    async insertTag(tag) {
      const [wallet, network] = scope(tag.owner);

      await pool.query(
        `INSERT INTO watchlist_collection_tags (id, wallet_address, network, label, normalized, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tag.id, wallet, network, tag.label, tag.normalized, tag.createdAt],
      );

      return tag;
    },

    async deleteTag(owner, id) {
      const [wallet, network] = scope(owner);

      return transaction(async () => {
        const detached = await pool.query(
          `UPDATE watchlist_collection_memberships
              SET tag_ids = array_remove(tag_ids, $1)
            WHERE wallet_address = $2 AND network = $3 AND $1 = ANY(tag_ids)`,
          [id, wallet, network],
        );

        await pool.query("DELETE FROM watchlist_collection_tags WHERE id = $1 AND wallet_address = $2 AND network = $3", [
          id,
          wallet,
          network,
        ]);

        return { detachedFrom: detached.rowCount ?? 0 };
      });
    },

    async insertMembership(membership) {
      const [wallet, network] = scope(membership.owner);

      return transaction(async () => {
        await pool.query(
          `INSERT INTO watchlist_collection_memberships
             (id, wallet_address, network, collection_id, watchlist_entry_id, position, tag_ids, added_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            membership.id,
            wallet,
            network,
            membership.collectionId,
            membership.watchlistEntryId,
            membership.position,
            membership.tagIds,
            membership.addedAt,
          ],
        );

        await pool.query(
          `UPDATE watchlist_collections
              SET updated_at = $4, revision = revision + 1
            WHERE id = $1 AND wallet_address = $2 AND network = $3`,
          [membership.collectionId, wallet, network, membership.addedAt],
        );

        return membership;
      });
    },

    async deleteMembership(owner, id) {
      const [wallet, network] = scope(owner);
      const result = await pool.query(
        "DELETE FROM watchlist_collection_memberships WHERE id = $1 AND wallet_address = $2 AND network = $3",
        [id, wallet, network],
      );

      return (result.rowCount ?? 0) > 0;
    },

    async replaceMembershipOrder(owner, collectionId, ordered) {
      const [wallet, network] = scope(owner);

      return transaction(async () => {
        for (const membership of ordered) {
          await pool.query(
            `UPDATE watchlist_collection_memberships
                SET position = $5
              WHERE id = $1 AND wallet_address = $2 AND network = $3 AND collection_id = $4`,
            [membership.id, wallet, network, collectionId, membership.position],
          );
        }

        return ordered;
      });
    },

    async upsertSavedView(view) {
      const [wallet, network] = scope(view.owner);

      await pool.query(
        `INSERT INTO watchlist_saved_views
           (id, wallet_address, network, name, collection_ids, tag_ids, search, sort, created_at, updated_at, revision)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                collection_ids = EXCLUDED.collection_ids,
                tag_ids = EXCLUDED.tag_ids,
                search = EXCLUDED.search,
                sort = EXCLUDED.sort,
                updated_at = EXCLUDED.updated_at,
                revision = EXCLUDED.revision
          WHERE watchlist_saved_views.wallet_address = $2 AND watchlist_saved_views.network = $3`,
        [
          view.id,
          wallet,
          network,
          view.name,
          view.filter.collectionIds,
          view.filter.tagIds,
          view.filter.search,
          view.filter.sort,
          view.createdAt,
          view.updatedAt,
          view.revision,
        ],
      );

      return view;
    },

    async deleteSavedView(owner, id) {
      const [wallet, network] = scope(owner);
      const result = await pool.query("DELETE FROM watchlist_saved_views WHERE id = $1 AND wallet_address = $2 AND network = $3", [
        id,
        wallet,
        network,
      ]);

      return (result.rowCount ?? 0) > 0;
    },

    async eraseOwner(owner) {
      const [wallet, network] = scope(owner);

      return transaction(async () => {
        const memberships = await pool.query(
          "DELETE FROM watchlist_collection_memberships WHERE wallet_address = $1 AND network = $2",
          [wallet, network],
        );
        const tags = await pool.query("DELETE FROM watchlist_collection_tags WHERE wallet_address = $1 AND network = $2", [
          wallet,
          network,
        ]);
        const savedViews = await pool.query("DELETE FROM watchlist_saved_views WHERE wallet_address = $1 AND network = $2", [
          wallet,
          network,
        ]);
        const collections = await pool.query("DELETE FROM watchlist_collections WHERE wallet_address = $1 AND network = $2", [
          wallet,
          network,
        ]);

        return {
          collections: collections.rowCount ?? 0,
          tags: tags.rowCount ?? 0,
          memberships: memberships.rowCount ?? 0,
          savedViews: savedViews.rowCount ?? 0,
        };
      });
    },
  };
}
