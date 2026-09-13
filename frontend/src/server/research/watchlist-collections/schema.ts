/**
 * Versioned contract for wallet-scoped watchlist collections, tags and views.
 *
 * This feature stores *metadata about* watched assets. It never stores, copies
 * or redefines an asset's identity: a membership holds a watchlist entry id and
 * nothing else, so the canonical identity stays in one place and a collection
 * cannot drift away from it.
 *
 * The second invariant is ownership. Every record carries the wallet and
 * network that owns it, and every read and write is filtered by that pair
 * before an id is ever looked up — so guessing an id belonging to another
 * wallet returns "not found", not someone else's data.
 */
import { z } from "zod";

export const COLLECTIONS_SCHEMA_VERSION = "watchlist-collections/2026-01" as const;

export const COLLECTION_LIMITS = {
  maxCollectionsPerWallet: 200,
  maxTagsPerWallet: 500,
  maxMembershipsPerCollection: 1_000,
  maxSavedViewsPerWallet: 100,
  maxNameLength: 80,
  maxDescriptionLength: 400,
  maxTagsPerMembership: 20,
  maxRequestBytes: 262_144,
} as const;

/**
 * The owner of a record: a wallet on a network.
 *
 * Both halves are required. The same address on two networks is two owners,
 * and treating them as one would leak a testnet collection into mainnet.
 */
export type OwnerScope = {
  walletAddress: string;
  network: string;
};

export type Collection = {
  id: string;
  owner: OwnerScope;
  name: string;
  description: string | null;
  /** Manual ordering. Lower sorts first; ties break by `createdAt`. */
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Bumped on every write, so a concurrent update can be detected. */
  revision: number;
};

export type Tag = {
  id: string;
  owner: OwnerScope;
  /** Display form, as the user typed it. */
  label: string;
  /** Normalized form used for uniqueness. Two labels normalizing alike are one tag. */
  normalized: string;
  createdAt: string;
};

export type Membership = {
  id: string;
  owner: OwnerScope;
  collectionId: string;
  /** The canonical watchlist entry id. This feature defines no asset identity. */
  watchlistEntryId: string;
  position: number;
  tagIds: string[];
  addedAt: string;
  /**
   * True when the watchlist entry this points at no longer exists.
   *
   * A dangling membership is shown, not deleted: silently removing it would
   * hide that something the user was tracking has gone.
   */
  referenceMissing: boolean;
};

export type SavedView = {
  id: string;
  owner: OwnerScope;
  name: string;
  /** Ids are validated against the caller's own records before being stored. */
  filter: {
    collectionIds: string[];
    tagIds: string[];
    /** Free-text match applied to the entry's symbol or name by the client. */
    search: string | null;
    sort: "manual" | "recently_added" | "name";
  };
  createdAt: string;
  updatedAt: string;
  revision: number;
};

export type CollectionsSnapshot = {
  schemaVersion: typeof COLLECTIONS_SCHEMA_VERSION;
  owner: OwnerScope;
  collections: Collection[];
  tags: Tag[];
  memberships: Membership[];
  savedViews: SavedView[];
  coverage: {
    state: "complete" | "partial" | "empty";
    note: string;
    /** Memberships whose watchlist entry has gone. */
    missingReferenceCount: number;
  };
  /** Deleting collection metadata never removes a watched asset. */
  assetsUnchanged: true;
};

const identifier = z.string().trim().min(1).max(120);

export const ownerScopeSchema = z.object({
  walletAddress: identifier,
  network: z.string().trim().min(1).max(40),
});

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(COLLECTION_LIMITS.maxNameLength),
  description: z.string().trim().max(COLLECTION_LIMITS.maxDescriptionLength).optional(),
  position: z.number().int().min(0).max(100_000).optional(),
});

export const updateCollectionSchema = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(COLLECTION_LIMITS.maxNameLength).optional(),
  description: z.string().trim().max(COLLECTION_LIMITS.maxDescriptionLength).nullable().optional(),
  position: z.number().int().min(0).max(100_000).optional(),
  /** The revision the caller last saw. A stale value is refused, not merged. */
  expectedRevision: z.number().int().min(0).optional(),
});

export const createTagSchema = z.object({
  label: z.string().trim().min(1).max(COLLECTION_LIMITS.maxNameLength),
});

export const addMembershipSchema = z.object({
  collectionId: identifier,
  watchlistEntryId: identifier,
  tagIds: z.array(identifier).max(COLLECTION_LIMITS.maxTagsPerMembership).optional(),
  position: z.number().int().min(0).max(100_000).optional(),
});

export const reorderMembershipsSchema = z.object({
  collectionId: identifier,
  /** Full ordered list of membership ids. Any omission is rejected. */
  orderedMembershipIds: z.array(identifier).max(COLLECTION_LIMITS.maxMembershipsPerCollection),
});

export const saveViewSchema = z.object({
  id: identifier.optional(),
  name: z.string().trim().min(1).max(COLLECTION_LIMITS.maxNameLength),
  collectionIds: z.array(identifier).max(COLLECTION_LIMITS.maxCollectionsPerWallet).default([]),
  tagIds: z.array(identifier).max(COLLECTION_LIMITS.maxTagsPerWallet).default([]),
  search: z.string().trim().max(120).nullable().optional(),
  sort: z.enum(["manual", "recently_added", "name"]).default("manual"),
  expectedRevision: z.number().int().min(0).optional(),
});

export const collectionsCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("snapshot"), owner: ownerScopeSchema }),
  z.object({ action: z.literal("create_collection"), owner: ownerScopeSchema, collection: createCollectionSchema }),
  z.object({ action: z.literal("update_collection"), owner: ownerScopeSchema, collection: updateCollectionSchema }),
  z.object({ action: z.literal("delete_collection"), owner: ownerScopeSchema, collectionId: identifier }),
  z.object({ action: z.literal("create_tag"), owner: ownerScopeSchema, tag: createTagSchema }),
  z.object({ action: z.literal("delete_tag"), owner: ownerScopeSchema, tagId: identifier }),
  z.object({ action: z.literal("add_membership"), owner: ownerScopeSchema, membership: addMembershipSchema }),
  z.object({ action: z.literal("remove_membership"), owner: ownerScopeSchema, membershipId: identifier }),
  z.object({ action: z.literal("reorder_memberships"), owner: ownerScopeSchema, reorder: reorderMembershipsSchema }),
  z.object({ action: z.literal("save_view"), owner: ownerScopeSchema, view: saveViewSchema }),
  z.object({ action: z.literal("delete_view"), owner: ownerScopeSchema, viewId: identifier }),
]);

export type CollectionsCommand = z.infer<typeof collectionsCommandSchema>;

export class CollectionsError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "CollectionsError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * A `not_found` that is deliberately indistinguishable from `forbidden`.
 *
 * When a caller asks for an id they do not own, saying "forbidden" would
 * confirm the id exists. Every ownership failure produces this.
 */
export function notFound(kind: string): CollectionsError {
  return new CollectionsError("not_found", `No ${kind} with that id belongs to this wallet and network.`, 404);
}
