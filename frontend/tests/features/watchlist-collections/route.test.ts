import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchlistEntry } from "@/server/types";
import { createMemoryCollectionsRepository } from "@/server/research/watchlist-collections/memoryRepository";
import { ENTRY_ONE, ENTRY_TWO, OWNER_A, OWNER_B, WALLET_A } from "./fixtures";

const watchlist = vi.hoisted(() => ({ entries: [] as WatchlistEntry[] }));

vi.mock("@/server/discovery/watchlist", () => ({
  listWatchlist: (walletAddress: string) =>
    watchlist.entries.filter((entry) => entry.walletAddress.toLowerCase() === walletAddress.toLowerCase()),
}));

const { POST, setCollectionsRepository } = await import("@/app/api/insights/watchlist-collections/route");

function entry(id: string, walletAddress: string): WatchlistEntry {
  return {
    id,
    walletAddress,
    identityKey: id,
    chain: "ethereum",
    network: "ethereum",
    source: "manual",
    createdAt: "2026-03-01T12:00:00.000Z",
  } as WatchlistEntry;
}

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/watchlist-collections", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  setCollectionsRepository(createMemoryCollectionsRepository());
  watchlist.entries = [entry(ENTRY_ONE, WALLET_A), entry(ENTRY_TWO, WALLET_A)];
});

afterEach(() => {
  setCollectionsRepository(null);
});

describe("POST /api/insights/watchlist-collections", () => {
  it("returns an empty snapshot for a wallet with nothing", async () => {
    const response = await POST(post({ action: "snapshot", owner: OWNER_A }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.snapshot.coverage.state).toBe("empty");
  });

  it("creates a collection and returns it with the new snapshot", async () => {
    const response = await POST(post({ action: "create_collection", owner: OWNER_A, collection: { name: "Blue chips" } }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.collection.name).toBe("Blue chips");
    expect(payload.snapshot.collections).toHaveLength(1);
  });

  it("answers 404 when a wallet names another wallet's collection", async () => {
    const created = await (await POST(post({ action: "create_collection", owner: OWNER_A, collection: { name: "Private" } }))).json();

    const response = await POST(
      post({ action: "update_collection", owner: OWNER_B, collection: { id: created.collection.id, name: "Taken" } }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "not_found" });
  });

  it("does not reveal whether another wallet's id exists", async () => {
    const created = await (await POST(post({ action: "create_collection", owner: OWNER_A, collection: { name: "Private" } }))).json();

    const real = await POST(post({ action: "delete_collection", owner: OWNER_B, collectionId: created.collection.id }));
    const invented = await POST(post({ action: "delete_collection", owner: OWNER_B, collectionId: "collection-does-not-exist" }));

    expect(real.status).toBe(invented.status);
    expect(await real.json()).toEqual(await invented.json());
  });

  it("refuses a membership for an entry the wallet does not watch", async () => {
    const created = await (await POST(post({ action: "create_collection", owner: OWNER_A, collection: { name: "Watching" } }))).json();

    const response = await POST(
      post({
        action: "add_membership",
        owner: OWNER_A,
        membership: { collectionId: created.collection.id, watchlistEntryId: "entry-not-watched" },
      }),
    );

    expect(response.status).toBe(404);
  });

  it("adds a membership for an entry the wallet does watch", async () => {
    const created = await (await POST(post({ action: "create_collection", owner: OWNER_A, collection: { name: "Watching" } }))).json();

    const response = await POST(
      post({
        action: "add_membership",
        owner: OWNER_A,
        membership: { collectionId: created.collection.id, watchlistEntryId: ENTRY_ONE },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.snapshot.memberships).toHaveLength(1);
    expect(payload.snapshot.assetsUnchanged).toBe(true);
  });

  it("returns 409 for a stale revision", async () => {
    const created = await (await POST(post({ action: "create_collection", owner: OWNER_A, collection: { name: "Original" } }))).json();

    await POST(post({ action: "update_collection", owner: OWNER_A, collection: { id: created.collection.id, name: "First", expectedRevision: 1 } }));

    const response = await POST(
      post({ action: "update_collection", owner: OWNER_A, collection: { id: created.collection.id, name: "Second", expectedRevision: 1 } }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "stale_revision" });
  });

  it("rejects an unknown action", async () => {
    const response = await POST(post({ action: "drop_everything", owner: OWNER_A }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(post({ action: "snapshot", owner: OWNER_A }, { "content-length": "9999999" }));

    expect(response.status).toBe(413);
  });
});
