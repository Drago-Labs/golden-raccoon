import { describe, expect, it } from "vitest";
import { runCollectionsCommand } from "@/server/research/watchlist-collections/service";
import type { CollectionsSnapshot } from "@/server/research/watchlist-collections/schema";
import {
  ENTRY_ONE,
  ENTRY_THREE,
  ENTRY_TWO,
  OWNER_A,
  OWNER_A_BASE,
  OWNER_B,
  REPOSITORIES,
  type Harness,
} from "./fixtures";

/**
 * One suite, run against both repositories.
 *
 * Every case below is a rule the feature promises. Running them against memory
 * and PostgreSQL together is what makes the two implementations
 * interchangeable rather than merely similar.
 */
async function run(harness: Harness, command: unknown) {
  return runCollectionsCommand(command, harness.deps);
}

async function createCollection(harness: Harness, name: string, owner = OWNER_A) {
  const result = await run(harness, { action: "create_collection", owner, collection: { name } });

  if (result.kind !== "collection") throw new Error("expected a collection");

  return result.collection;
}

async function snapshotOf(harness: Harness, owner = OWNER_A): Promise<CollectionsSnapshot> {
  const result = await run(harness, { action: "snapshot", owner });

  if (result.kind !== "snapshot") throw new Error("expected a snapshot");

  return result.snapshot;
}

describe.each(REPOSITORIES)("$name repository", ({ build }) => {
  describe("collections, ordering and duplicates", () => {
    it("returns an explicit empty snapshot for a wallet with nothing", async () => {
      const harness = build();
      const snapshot = await snapshotOf(harness);

      expect(snapshot.coverage.state).toBe("empty");
      expect(snapshot.collections).toHaveLength(0);
    });

    it("orders collections by position, then by creation time", async () => {
      const harness = build();

      await createCollection(harness, "First");
      harness.tick();
      await createCollection(harness, "Second");
      harness.tick();
      await createCollection(harness, "Third");

      const snapshot = await snapshotOf(harness);

      expect(snapshot.collections.map((entry) => entry.name)).toEqual(["First", "Second", "Third"]);
      expect(snapshot.collections.map((entry) => entry.position)).toEqual([0, 1, 2]);
    });

    it("applies a manual reordering of collections", async () => {
      const harness = build();
      const first = await createCollection(harness, "First");
      harness.tick();
      await createCollection(harness, "Second");

      await run(harness, {
        action: "update_collection",
        owner: OWNER_A,
        collection: { id: first.id, position: 5 },
      });

      const snapshot = await snapshotOf(harness);

      expect(snapshot.collections.map((entry) => entry.name)).toEqual(["Second", "First"]);
    });

    it("adds one watchlist entry to a collection only once", async () => {
      const harness = build();
      const target = await createCollection(harness, "Blue chips");

      const first = await run(harness, {
        action: "add_membership",
        owner: OWNER_A,
        membership: { collectionId: target.id, watchlistEntryId: ENTRY_ONE },
      });
      const second = await run(harness, {
        action: "add_membership",
        owner: OWNER_A,
        membership: { collectionId: target.id, watchlistEntryId: ENTRY_ONE },
      });

      expect(first.kind).toBe("membership");
      expect(second.kind).toBe("membership");
      expect(second.snapshot.memberships).toHaveLength(1);
      expect(second.kind === "membership" && second.membership.id).toBe(first.kind === "membership" && first.membership.id);
    });

    it("orders memberships and applies a full reordering", async () => {
      const harness = build();
      const target = await createCollection(harness, "Watching");

      for (const entry of [ENTRY_ONE, ENTRY_TWO, ENTRY_THREE]) {
        harness.tick();
        await run(harness, { action: "add_membership", owner: OWNER_A, membership: { collectionId: target.id, watchlistEntryId: entry } });
      }

      const before = await snapshotOf(harness);
      const reversed = [...before.memberships].reverse().map((membership) => membership.id);

      await run(harness, {
        action: "reorder_memberships",
        owner: OWNER_A,
        reorder: { collectionId: target.id, orderedMembershipIds: reversed },
      });

      const after = await snapshotOf(harness);

      expect(after.memberships.map((membership) => membership.watchlistEntryId)).toEqual([ENTRY_THREE, ENTRY_TWO, ENTRY_ONE]);
    });

    it("refuses a reordering that omits a membership", async () => {
      const harness = build();
      const target = await createCollection(harness, "Watching");

      await run(harness, { action: "add_membership", owner: OWNER_A, membership: { collectionId: target.id, watchlistEntryId: ENTRY_ONE } });
      harness.tick();
      await run(harness, { action: "add_membership", owner: OWNER_A, membership: { collectionId: target.id, watchlistEntryId: ENTRY_TWO } });

      const snapshot = await snapshotOf(harness);

      await expect(
        run(harness, {
          action: "reorder_memberships",
          owner: OWNER_A,
          reorder: { collectionId: target.id, orderedMembershipIds: [snapshot.memberships[0].id] },
        }),
      ).rejects.toMatchObject({ code: "incomplete_ordering" });
    });
  });

  describe("tags", () => {
    it("treats labels that normalize alike as one tag", async () => {
      const harness = build();

      const first = await run(harness, { action: "create_tag", owner: OWNER_A, tag: { label: "DeFi" } });
      const second = await run(harness, { action: "create_tag", owner: OWNER_A, tag: { label: "  defi  " } });

      expect(second.snapshot.tags).toHaveLength(1);
      expect(first.kind === "tag" && second.kind === "tag" && first.tag.id === second.tag.id).toBe(true);
    });

    it("keeps the label the user typed", async () => {
      const harness = build();
      const result = await run(harness, { action: "create_tag", owner: OWNER_A, tag: { label: "Blue Chip" } });

      expect(result.kind === "tag" && result.tag.label).toBe("Blue Chip");
      expect(result.kind === "tag" && result.tag.normalized).toBe("blue chip");
    });

    it("detaches a deleted tag from every membership that carried it", async () => {
      const harness = build();
      const target = await createCollection(harness, "Watching");
      const tag = await run(harness, { action: "create_tag", owner: OWNER_A, tag: { label: "defi" } });
      const tagId = tag.kind === "tag" ? tag.tag.id : "";

      await run(harness, {
        action: "add_membership",
        owner: OWNER_A,
        membership: { collectionId: target.id, watchlistEntryId: ENTRY_ONE, tagIds: [tagId] },
      });

      const deleted = await run(harness, { action: "delete_tag", owner: OWNER_A, tagId });

      expect(deleted.snapshot.tags).toHaveLength(0);
      expect(deleted.snapshot.memberships[0].tagIds).toEqual([]);
      expect(deleted.snapshot.memberships).toHaveLength(1);
    });

    it("refuses a membership tagged with an unknown tag id", async () => {
      const harness = build();
      const target = await createCollection(harness, "Watching");

      await expect(
        run(harness, {
          action: "add_membership",
          owner: OWNER_A,
          membership: { collectionId: target.id, watchlistEntryId: ENTRY_ONE, tagIds: ["tag-does-not-exist"] },
        }),
      ).rejects.toMatchObject({ code: "unknown_reference" });
    });
  });

  describe("cross-wallet and cross-network isolation", () => {
    it("hides one wallet's collections from another", async () => {
      const harness = build();
      await createCollection(harness, "Private", OWNER_A);

      const otherSnapshot = await snapshotOf(harness, OWNER_B);

      expect(otherSnapshot.collections).toHaveLength(0);
      expect(otherSnapshot.coverage.state).toBe("empty");
    });

    it("answers not_found when a wallet guesses another's collection id", async () => {
      const harness = build();
      const target = await createCollection(harness, "Private", OWNER_A);

      await expect(
        run(harness, { action: "update_collection", owner: OWNER_B, collection: { id: target.id, name: "Taken" } }),
      ).rejects.toMatchObject({ code: "not_found", status: 404 });
    });

    it("refuses to delete another wallet's collection", async () => {
      const harness = build();
      const target = await createCollection(harness, "Private", OWNER_A);

      await expect(run(harness, { action: "delete_collection", owner: OWNER_B, collectionId: target.id })).rejects.toMatchObject({
        code: "not_found",
      });

      expect((await snapshotOf(harness, OWNER_A)).collections).toHaveLength(1);
    });

    it("refuses to remove another wallet's membership", async () => {
      const harness = build();
      const target = await createCollection(harness, "Private", OWNER_A);
      const membership = await run(harness, {
        action: "add_membership",
        owner: OWNER_A,
        membership: { collectionId: target.id, watchlistEntryId: ENTRY_ONE },
      });

      await expect(
        run(harness, {
          action: "remove_membership",
          owner: OWNER_B,
          membershipId: membership.kind === "membership" ? membership.membership.id : "",
        }),
      ).rejects.toMatchObject({ code: "not_found" });
    });

    it("treats the same address on another network as a different owner", async () => {
      const harness = build();
      await createCollection(harness, "Ethereum only", OWNER_A);

      const onBase = await snapshotOf(harness, OWNER_A_BASE);

      expect(onBase.collections).toHaveLength(0);
    });

    it("lets two wallets each hold a tag with the same label", async () => {
      const harness = build();

      await run(harness, { action: "create_tag", owner: OWNER_A, tag: { label: "defi" } });
      await run(harness, { action: "create_tag", owner: OWNER_B, tag: { label: "defi" } });

      expect((await snapshotOf(harness, OWNER_A)).tags).toHaveLength(1);
      expect((await snapshotOf(harness, OWNER_B)).tags).toHaveLength(1);
    });

    it("compares wallet addresses without regard to case", async () => {
      const harness = build();
      await createCollection(harness, "Mine", OWNER_A);

      const lowercase = await snapshotOf(harness, { walletAddress: OWNER_A.walletAddress.toLowerCase(), network: "ethereum" });

      expect(lowercase.collections).toHaveLength(1);
    });
  });

  describe("concurrent updates and deleted references", () => {
    it("refuses a write whose base revision is stale", async () => {
      const harness = build();
      const target = await createCollection(harness, "Original");

      await run(harness, {
        action: "update_collection",
        owner: OWNER_A,
        collection: { id: target.id, name: "First edit", expectedRevision: target.revision },
      });

      await expect(
        run(harness, {
          action: "update_collection",
          owner: OWNER_A,
          collection: { id: target.id, name: "Second edit", expectedRevision: target.revision },
        }),
      ).rejects.toMatchObject({ code: "stale_revision", status: 409 });
    });

    it("allows a write that does not claim a base revision", async () => {
      const harness = build();
      const target = await createCollection(harness, "Original");

      const updated = await run(harness, { action: "update_collection", owner: OWNER_A, collection: { id: target.id, name: "Renamed" } });

      expect(updated.kind === "collection" && updated.collection.name).toBe("Renamed");
      expect(updated.kind === "collection" && updated.collection.revision).toBe(2);
    });

    it("flags a membership whose watchlist entry has gone, rather than removing it", async () => {
      const harness = build();
      const target = await createCollection(harness, "Watching");

      await run(harness, { action: "add_membership", owner: OWNER_A, membership: { collectionId: target.id, watchlistEntryId: ENTRY_ONE } });

      harness.setEntries([ENTRY_TWO, ENTRY_THREE]);

      const snapshot = await snapshotOf(harness);

      expect(snapshot.memberships).toHaveLength(1);
      expect(snapshot.memberships[0].referenceMissing).toBe(true);
      expect(snapshot.coverage.state).toBe("partial");
      expect(snapshot.coverage.note).toMatch(/shown rather than removed/i);
    });

    it("refuses to add a membership for an entry that is not watched", async () => {
      const harness = build();
      const target = await createCollection(harness, "Watching");

      await expect(
        run(harness, { action: "add_membership", owner: OWNER_A, membership: { collectionId: target.id, watchlistEntryId: "not-watched" } }),
      ).rejects.toMatchObject({ code: "not_found" });
    });
  });

  describe("deletion removes metadata only", () => {
    it("keeps the watched assets when a collection is deleted", async () => {
      const harness = build();
      const target = await createCollection(harness, "Watching");

      await run(harness, { action: "add_membership", owner: OWNER_A, membership: { collectionId: target.id, watchlistEntryId: ENTRY_ONE } });

      const deleted = await run(harness, { action: "delete_collection", owner: OWNER_A, collectionId: target.id });

      expect(deleted.kind === "deleted" && deleted.deleted.deletedMemberships).toBe(1);
      expect(deleted.kind === "deleted" && deleted.deleted.assetsRemoved).toBe(0);
      expect(deleted.snapshot.assetsUnchanged).toBe(true);
      // The watchlist itself is untouched: the entry is still available to be
      // added to another collection.
      expect(await harness.deps.listWatchlistEntryIds(OWNER_A)).toContain(ENTRY_ONE);
    });

    it("leaves a saved view intact when a collection it names is deleted", async () => {
      const harness = build();
      const target = await createCollection(harness, "Watching");

      await run(harness, {
        action: "save_view",
        owner: OWNER_A,
        view: { name: "My view", collectionIds: [target.id], tagIds: [], sort: "manual" },
      });

      const deleted = await run(harness, { action: "delete_collection", owner: OWNER_A, collectionId: target.id });

      expect(deleted.snapshot.savedViews).toHaveLength(1);
      expect(deleted.snapshot.savedViews[0].filter.collectionIds).toEqual([target.id]);
    });
  });

  describe("saved views", () => {
    it("refuses a view naming a collection the wallet does not own", async () => {
      const harness = build();
      const target = await createCollection(harness, "Private", OWNER_A);

      await expect(
        run(harness, {
          action: "save_view",
          owner: OWNER_B,
          view: { name: "Probe", collectionIds: [target.id], tagIds: [], sort: "manual" },
        }),
      ).rejects.toMatchObject({ code: "unknown_reference" });
    });

    it("updates a view in place and bumps its revision", async () => {
      const harness = build();
      const created = await run(harness, {
        action: "save_view",
        owner: OWNER_A,
        view: { name: "Mine", collectionIds: [], tagIds: [], sort: "manual" },
      });
      const viewId = created.kind === "view" ? created.view.id : "";

      const updated = await run(harness, {
        action: "save_view",
        owner: OWNER_A,
        view: { id: viewId, name: "Renamed", collectionIds: [], tagIds: [], sort: "name", expectedRevision: 1 },
      });

      expect(updated.snapshot.savedViews).toHaveLength(1);
      expect(updated.kind === "view" && updated.view.name).toBe("Renamed");
      expect(updated.kind === "view" && updated.view.revision).toBe(2);
    });

    it("collapses duplicate ids inside a filter", async () => {
      const harness = build();
      const target = await createCollection(harness, "Watching");

      const created = await run(harness, {
        action: "save_view",
        owner: OWNER_A,
        view: { name: "Mine", collectionIds: [target.id, target.id], tagIds: [], sort: "manual" },
      });

      expect(created.kind === "view" && created.view.filter.collectionIds).toEqual([target.id]);
    });
  });
});
