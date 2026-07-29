import { describe, it, expect, beforeEach } from "vitest";

function resetStore() {
  delete (globalThis as Record<string, unknown>).__goldenRaccoonWatchlistEntries;
  delete (globalThis as Record<string, unknown>).__goldenRaccoonWatchlistScanRuns;
  delete (globalThis as Record<string, unknown>).__goldenRaccoonDiscoveryAlerts;
  delete (globalThis as Record<string, unknown>).__goldenRaccoonRateLimit;
}

describe("deriveCanonicalChainIdentity", () => {
  beforeEach(() => resetStore());

  it("returns native identity for native assetType", async () => {
    const { deriveCanonicalChainIdentity } = await import(
      "@/server/discovery/watchlist"
    );
    const { identityKey, resolved } = deriveCanonicalChainIdentity({
      walletAddress: "0x123",
      chain: "stellar-pubnet",
      symbol: "XLM",
      tokenName: "Stellar Lumens",
      assetType: "native",
      source: "manual",
    });
    expect(identityKey).toBe("native");
    expect(resolved.assetType).toBe("native");
  });

  it("produces identity for EVM contract", async () => {
    const { deriveCanonicalChainIdentity } = await import(
      "@/server/discovery/watchlist"
    );
    const { identityKey } = deriveCanonicalChainIdentity({
      walletAddress: "0x123",
      chain: "base",
      contractAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
      symbol: "TEST",
      tokenName: "Test Token",
      assetType: "contract",
      source: "manual",
    });
    expect(identityKey).toContain("base");
    expect(identityKey).toContain("0xabc");
  });
});

describe("addToWatchlist", () => {
  beforeEach(() => resetStore());

  it("rejects unresolved identity", async () => {
    const { addToWatchlist } = await import("@/server/discovery/watchlist");
    const result = await addToWatchlist({
      walletAddress: "0x123",
      chain: "base",
      source: "manual",
    });
    expect(result.ok).toBe(false);
  });

  it("adds native XLM successfully", async () => {
    const { addToWatchlist } = await import("@/server/discovery/watchlist");
    const result = await addToWatchlist({
      walletAddress: "0x123",
      chain: "stellar-pubnet",
      symbol: "XLM",
      tokenName: "Stellar Lumens",
      assetType: "native",
      source: "manual",
    });
    expect(result.ok).toBe(true);
  });
});

describe("listWatchlist wallet isolation", () => {
  beforeEach(() => resetStore());

  it("only returns entries for the queried wallet", async () => {
    const { addWatchlistEntry } = await import("@/server/storage");
    addWatchlistEntry({
      walletAddress: "0xwallet_a",
      chain: "base",
      source: "manual",
      identityKey: "base:0x1",
    });
    addWatchlistEntry({
      walletAddress: "0xwallet_b",
      chain: "base",
      source: "manual",
      identityKey: "base:0x2",
    });

    const { listWatchlist } = await import("@/server/discovery/watchlist");
    const forA = listWatchlist("0xwallet_a");
    expect(forA.length).toBe(1);
    expect(forA[0].walletAddress.toLowerCase()).toBe("0xwallet_a");

    const forB = listWatchlist("0xwallet_b");
    expect(forB.length).toBe(1);
    expect(forB[0].walletAddress.toLowerCase()).toBe("0xwallet_b");
  });
});

describe("removeFromWatchlist wallet isolation", () => {
  beforeEach(() => resetStore());

  it("removes entry by id", async () => {
    const { addWatchlistEntry } = await import("@/server/storage");
    const { entry } = addWatchlistEntry({
      walletAddress: "0xwallet",
      chain: "base",
      source: "manual",
      identityKey: "base:0x1",
    });
    const { removeFromWatchlist } = await import("@/server/discovery/watchlist");
    const ok = await removeFromWatchlist(entry.id);
    expect(ok).toBe(true);
  });
});

describe("rate limit profiles", () => {
  beforeEach(() => resetStore());

  it("watchlistRescan profile exists", async () => {
    const { rateLimitProfiles } = await import("@/server/security/rateLimit");
    expect(rateLimitProfiles.watchlistRescan).toBeDefined();
    expect(rateLimitProfiles.watchlistRescan.limit).toBeGreaterThan(0);
  });

  it("checkRateLimitProfile returns null under limit", async () => {
    const { checkRateLimitProfile, __resetRateLimitBucketsForTests } = await import(
      "@/server/security/rateLimit"
    );
    __resetRateLimitBucketsForTests();
    const request = new Request("http://localhost/api/watchlist/test/rescan");
    const result = checkRateLimitProfile(request, "watchlistRescan");
    expect(result).toBeNull();
  });
});
