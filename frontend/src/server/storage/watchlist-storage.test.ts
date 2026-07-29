import { describe, it, expect, beforeEach } from "vitest";
import type { WatchlistEntryInput } from "@/server/types";

function resetStore() {
  delete (globalThis as Record<string, unknown>).__goldenRaccoonWatchlistEntries;
  delete (globalThis as Record<string, unknown>).__goldenRaccoonWatchlistScanRuns;
  delete (globalThis as Record<string, unknown>).__goldenRaccoonDiscoveryAlerts;
}

const evmEntry: WatchlistEntryInput = {
  walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
  chain: "base",
  contractAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
  symbol: "TEST",
  tokenName: "Test Token",
  assetType: "contract",
  source: "manual",
};

const stellarEntry: WatchlistEntryInput = {
  walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
  chain: "stellar-pubnet",
  assetKey: "USDC",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  symbol: "USDC",
  tokenName: "USD Coin",
  assetType: "classic",
  source: "manual",
};

const nativeXlm: WatchlistEntryInput = {
  walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
  chain: "stellar-pubnet",
  symbol: "XLM",
  tokenName: "Stellar Lumens",
  assetType: "native",
  source: "manual",
};

describe("watchlist storage – addWatchlistEntry", () => {
  beforeEach(() => resetStore());

  it("adds an EVM contract entry", async () => {
    const { addWatchlistEntry } = await import("./index");
    const { entry, alreadyExisted } = addWatchlistEntry({
      ...evmEntry,
      identityKey: "base:0xabcdef1234567890abcdef1234567890abcdef12",
    });
    expect(entry.id).toBeTruthy();
    expect(entry.chain).toBe("base");
    expect(entry.symbol).toBe("TEST");
    expect(alreadyExisted).toBe(false);
  });

  it("adds a Stellar classic entry", async () => {
    const { addWatchlistEntry } = await import("./index");
    const { entry } = addWatchlistEntry({
      ...stellarEntry,
      identityKey: "stellar-pubnet:USDC",
    });
    expect(entry.assetKey).toBe("USDC");
    expect(entry.issuer).toBe(stellarEntry.issuer);
  });

  it("rejects duplicate by wallet + identityKey", async () => {
    const { addWatchlistEntry } = await import("./index");
    addWatchlistEntry({
      ...evmEntry,
      identityKey: "base:0xabc",
    });
    const { alreadyExisted } = addWatchlistEntry({
      ...evmEntry,
      identityKey: "base:0xabc",
    });
    expect(alreadyExisted).toBe(true);
  });

  it("allows same identityKey for different wallets", async () => {
    const { addWatchlistEntry } = await import("./index");
    const walletA = { ...evmEntry, walletAddress: "0xaaa" };
    const walletB = { ...evmEntry, walletAddress: "0xbbb" };
    addWatchlistEntry({ ...walletA, identityKey: "base:0xabc" });
    const { alreadyExisted } = addWatchlistEntry({
      ...walletB,
      identityKey: "base:0xabc",
    });
    expect(alreadyExisted).toBe(false);
  });
});

describe("watchlist storage – list/get/remove", () => {
  beforeEach(() => resetStore());

  it("lists entries newest first", async () => {
    const { addWatchlistEntry, listWatchlistEntries } = await import("./index");
    addWatchlistEntry({ ...evmEntry, identityKey: "base:0x1" });
    await new Promise((r) => setTimeout(r, 1));
    addWatchlistEntry({ ...stellarEntry, identityKey: "stellar:usdc" });
    const all = listWatchlistEntries();
    expect(all.length).toBe(2);
    expect(all[0].assetKey).toBe("USDC");
  });

  it("filters by walletAddress", async () => {
    const { addWatchlistEntry, listWatchlistEntries } = await import("./index");
    addWatchlistEntry({
      ...evmEntry,
      walletAddress: "0xaaa",
      identityKey: "base:0x1",
    });
    addWatchlistEntry({
      ...evmEntry,
      walletAddress: "0xbbb",
      identityKey: "base:0x2",
    });
    expect(listWatchlistEntries("0xaaa").length).toBe(1);
    expect(listWatchlistEntries("0xbbb").length).toBe(1);
    expect(listWatchlistEntries("0xccc").length).toBe(0);
  });

  it("getWatchlistEntry returns entry by id", async () => {
    const { addWatchlistEntry, getWatchlistEntry } = await import("./index");
    const { entry } = addWatchlistEntry({
      ...evmEntry,
      identityKey: "base:0x1",
    });
    const found = getWatchlistEntry(entry.id);
    expect(found?.id).toBe(entry.id);
    expect(getWatchlistEntry("nonexistent")).toBeUndefined();
  });

  it("removeWatchlistEntry removes entry and cascades", async () => {
    const {
      addWatchlistEntry,
      removeWatchlistEntry,
      getWatchlistEntry,
      addWatchlistScanRun,
      listWatchlistScanRuns,
    } = await import("./index");
    const { entry } = addWatchlistEntry({
      ...evmEntry,
      identityKey: "base:0x1",
    });
    addWatchlistScanRun({
      entryId: entry.id,
      walletAddress: entry.walletAddress,
      identityKey: entry.identityKey,
      classification: "watch",
      classificationReasons: [],
      confidence: 0.5,
      score: 30,
      sourceLineage: [],
      missingData: [],
    });
    const removed = removeWatchlistEntry(entry.id);
    expect(removed).toBe(true);
    expect(getWatchlistEntry(entry.id)).toBeUndefined();
    expect(listWatchlistScanRuns(entry.id).length).toBe(0);
  });
});

describe("watchlist storage – scan runs", () => {
  beforeEach(() => resetStore());

  it("addWatchlistScanRun creates immutable record and updates latest scan", async () => {
    const { addWatchlistEntry, addWatchlistScanRun, getWatchlistEntry, listWatchlistScanRuns } =
      await import("./index");
    const { entry } = addWatchlistEntry({
      ...evmEntry,
      identityKey: "base:0x1",
    });
    const run = addWatchlistScanRun({
      entryId: entry.id,
      walletAddress: entry.walletAddress,
      identityKey: entry.identityKey,
      classification: "risky",
      classificationReasons: ["test"],
      confidence: 0.6,
      score: 65,
      sourceLineage: [],
      missingData: [],
    });
    expect(run.id).toBeTruthy();
    expect(run.entryId).toBe(entry.id);
    expect(run.classification).toBe("risky");
    const updated = getWatchlistEntry(entry.id);
    expect(updated?.lastScannedAt).toBe(run.scannedAt);
    expect(updated?.latestStatus).toBe("completed");
    const runs = listWatchlistScanRuns(entry.id);
    expect(runs.length).toBe(1);
  });

  it("stores previousRunId on second scan", async () => {
    const { addWatchlistEntry, addWatchlistScanRun } = await import("./index");
    const { entry } = addWatchlistEntry({
      ...evmEntry,
      identityKey: "base:0x1",
    });
    addWatchlistScanRun({
      entryId: entry.id,
      walletAddress: entry.walletAddress,
      identityKey: entry.identityKey,
      classification: "watch",
      classificationReasons: [],
      confidence: 0.5,
      score: 30,
      sourceLineage: [],
      missingData: [],
    });
    const second = addWatchlistScanRun({
      entryId: entry.id,
      walletAddress: entry.walletAddress,
      identityKey: entry.identityKey,
      classification: "risky",
      classificationReasons: [],
      confidence: 0.7,
      score: 70,
      sourceLineage: [],
      missingData: [],
    });
    expect(second.previousRunId).toBeTruthy();
  });
});

describe("watchlist storage – updateWatchlistEntryLatestScan", () => {
  beforeEach(() => resetStore());

  it("preserves successful result when update fails", async () => {
    const { addWatchlistEntry, updateWatchlistEntryLatestScan, getWatchlistEntry } =
      await import("./index");
    const { entry } = addWatchlistEntry({
      ...evmEntry,
      identityKey: "base:0x1",
    });
    updateWatchlistEntryLatestScan(entry.id, {
      scanRunId: "run1",
      classification: "watch",
      score: 30,
      scannedAt: new Date().toISOString(),
      status: "completed",
    });
    updateWatchlistEntryLatestScan(entry.id, {
      scanRunId: "run2",
      classification: "watch",
      score: 30,
      scannedAt: new Date().toISOString(),
      status: "failed",
    });
    const updated = getWatchlistEntry(entry.id);
    expect(updated?.latestStatus).toBe("stale");
    expect(updated?.latestClassification).toBe("watch");
  });
});

describe("watchlist storage – getStorageCounts", () => {
  beforeEach(() => resetStore());

  it("includes watchlist entries and scan records", async () => {
    const { addWatchlistEntry, addWatchlistScanRun, getStorageCounts } = await import("./index");
    addWatchlistEntry({ ...evmEntry, identityKey: "base:0x1" });
    const { entry } = addWatchlistEntry({
      ...evmEntry,
      identityKey: "base:0x2",
    });
    addWatchlistScanRun({
      entryId: entry.id,
      walletAddress: entry.walletAddress,
      identityKey: entry.identityKey,
      classification: "watch",
      classificationReasons: [],
      confidence: 0.5,
      score: 30,
      sourceLineage: [],
      missingData: [],
    });
    const counts = getStorageCounts();
    expect(counts.watchlistEntries).toBe(2);
    expect(counts.watchlistScanRecords).toBe(1);
  });
});
