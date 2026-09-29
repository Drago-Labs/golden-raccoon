import { describe, expect, it } from "vitest";
import { eraseCollectionMetadata, exportCollectionMetadata, runCollectionsCommand } from "@/server/research/watchlist-collections/service";
import { ENTRY_ONE, ENTRY_TWO, OWNER_A, OWNER_A_BASE, OWNER_B, REPOSITORIES, type Harness } from "./fixtures";

/**
 * The privacy hooks: export and erasure.
 *
 * Both are metadata-only by construction, and these cases pin that down — an
 * erasure that quietly took watchlist entries with it would be a data-loss bug
 * that no amount of care in the erasure path could catch afterwards.
 */
async function seed(harness: Harness) {
  const created = await runCollectionsCommand(
    { action: "create_collection", owner: OWNER_A, collection: { name: "Blue chips" } },
    harness.deps,
  );
  const collectionId = created.kind === "collection" ? created.collection.id : "";

  const tag = await runCollectionsCommand({ action: "create_tag", owner: OWNER_A, tag: { label: "defi" } }, harness.deps);
  const tagId = tag.kind === "tag" ? tag.tag.id : "";

  await runCollectionsCommand(
    { action: "add_membership", owner: OWNER_A, membership: { collectionId, watchlistEntryId: ENTRY_ONE, tagIds: [tagId] } },
    harness.deps,
  );
  await runCollectionsCommand(
    { action: "add_membership", owner: OWNER_A, membership: { collectionId, watchlistEntryId: ENTRY_TWO } },
    harness.deps,
  );
  await runCollectionsCommand(
    { action: "save_view", owner: OWNER_A, view: { name: "Mine", collectionIds: [collectionId], tagIds: [tagId], sort: "manual" } },
    harness.deps,
  );

  return { collectionId, tagId };
}

describe.each(REPOSITORIES)("$name repository · privacy hooks", ({ build }) => {
  it("exports exactly what the workspace shows", async () => {
    const harness = build();
    await seed(harness);

    const exported = await exportCollectionMetadata(OWNER_A, harness.deps);

    expect(exported.collections).toHaveLength(1);
    expect(exported.tags).toHaveLength(1);
    expect(exported.memberships).toHaveLength(2);
    expect(exported.savedViews).toHaveLength(1);
    expect(exported.owner.walletAddress).toBe(OWNER_A.walletAddress.toLowerCase());
  });

  it("erases every collection record the wallet owns on that network", async () => {
    const harness = build();
    await seed(harness);

    const counts = await eraseCollectionMetadata(OWNER_A, harness.repository);

    expect(counts).toEqual({ collections: 1, tags: 1, memberships: 2, savedViews: 1 });

    const after = await exportCollectionMetadata(OWNER_A, harness.deps);

    expect(after.coverage.state).toBe("empty");
  });

  it("removes metadata only, leaving the watched assets in place", async () => {
    const harness = build();
    await seed(harness);

    await eraseCollectionMetadata(OWNER_A, harness.repository);

    // The watchlist is the source of asset identity and is untouched: both
    // entries are still watched after the metadata is gone.
    expect(await harness.deps.listWatchlistEntryIds(OWNER_A)).toEqual(expect.arrayContaining([ENTRY_ONE, ENTRY_TWO]));
  });

  it("leaves another wallet's metadata alone", async () => {
    const harness = build();
    await seed(harness);
    await runCollectionsCommand({ action: "create_collection", owner: OWNER_B, collection: { name: "Theirs" } }, harness.deps);

    await eraseCollectionMetadata(OWNER_A, harness.repository);

    const other = await exportCollectionMetadata(OWNER_B, harness.deps);

    expect(other.collections).toHaveLength(1);
  });

  it("leaves the same wallet's metadata on another network alone", async () => {
    const harness = build();
    await seed(harness);
    await runCollectionsCommand({ action: "create_collection", owner: OWNER_A_BASE, collection: { name: "On Base" } }, harness.deps);

    await eraseCollectionMetadata(OWNER_A, harness.repository);

    const onBase = await exportCollectionMetadata(OWNER_A_BASE, harness.deps);

    expect(onBase.collections).toHaveLength(1);
  });

  it("is safe to run twice", async () => {
    const harness = build();
    await seed(harness);

    await eraseCollectionMetadata(OWNER_A, harness.repository);
    const second = await eraseCollectionMetadata(OWNER_A, harness.repository);

    expect(second).toEqual({ collections: 0, tags: 0, memberships: 0, savedViews: 0 });
  });
});
