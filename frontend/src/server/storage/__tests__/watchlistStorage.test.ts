import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each test file uses a fresh temp dir so disk-backed persistence does not
// leak state across tests.
const tempRoot = mkdtempSync(join(tmpdir(), "watchlist-storage-tests-"));
process.env.WATCHLIST_DATA_DIR = tempRoot;

// Import after env setup so the persistence layer resolves to our temp dir.
const storage = await import("@/server/storage");
const persistence = await import("@/server/storage/persistence");

const evmWallet = "0x000000000000000000000000000000000000dEaD";
const otherEvmWallet = "0x000000000000000000000000000000000000c0FFEE";
const stellarWallet = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACR6";

describe("watchlist storage (file-backed)", () => {
  it("round-trips entries and scan records to disk and reloads on a fresh import", async () => {
    await persistence.__resetWatchlistPersistenceForTests();

    const entry = await storage.createWatchlistEntry({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "base",
      assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
      assetType: "evm_contract",
      symbol: "MEME",
      name: "Meme Token",
    });

    await storage.createWatchlistScanRecord({
      watchlistEntryId: entry.id,
      walletAddress: entry.walletAddress,
      chainFamily: entry.chainFamily,
      network: entry.network,
      assetIdentifier: entry.assetIdentifier,
      assetType: entry.assetType,
      query: entry.assetIdentifier,
      symbol: entry.symbol,
      status: "complete",
      verdict: "watch",
      riskScore: 42,
      scanCompleted: true,
    });

    // Simulate a process restart by clearing the in-memory cache.
    await persistence.__resetWatchlistPersistenceForTests();
    // Reload from disk.
    const reloaded = await storage.getWatchlistEntry(entry.id);

    expect(reloaded).toBeDefined();
    expect(reloaded?.walletAddress).toBe(evmWallet);
    expect(reloaded?.assetIdentifier).toBe("0xabcdef1234567890abcdef1234567890abcdef12");

    const scans = await storage.listWatchlistScanRecordsForEntry(entry.id);
    expect(scans).toHaveLength(1);
    expect(scans[0].verdict).toBe("watch");
  });

  it("rejects duplicate identities when network differs", async () => {
    await persistence.__resetWatchlistPersistenceForTests();

    await storage.createWatchlistEntry({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "base",
      assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
      assetType: "evm_contract",
      symbol: "MEME",
    });

    // Same address, different EVM network — must be a distinct entry.
    const second = await storage.createWatchlistEntry({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "ethereum",
      assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
      assetType: "evm_contract",
      symbol: "MEME",
    });

    expect(second.id).toBeTruthy();
    expect(second.network).toBe("ethereum");

    // Back on `base` the original identity must still throw.
    await expect(
      storage.createWatchlistEntry({
        walletAddress: evmWallet,
        chainFamily: "evm",
        network: "base",
        assetIdentifier: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
        assetType: "evm_contract",
        symbol: "MEME",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("enforces wallet ownership on getWatchlistEntryForWallet", async () => {
    await persistence.__resetWatchlistPersistenceForTests();

    const entry = await storage.createWatchlistEntry({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "base",
      assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
      assetType: "evm_contract",
      symbol: "MEME",
    });

    const ownerView = await storage.getWatchlistEntryForWallet(entry.id, evmWallet);

    expect(ownerView?.id).toBe(entry.id);

    const intruderView = await storage.getWatchlistEntryForWallet(entry.id, otherEvmWallet);

    expect(intruderView).toBeUndefined();
  });

  it("returns no entries for an unrelated wallet", async () => {
    await persistence.__resetWatchlistPersistenceForTests();

    await storage.createWatchlistEntry({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "base",
      assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
      assetType: "evm_contract",
      symbol: "MEME",
    });

    const myEntries = await storage.listWatchlistEntries(evmWallet);

    expect(myEntries).toHaveLength(1);

    const otherEntries = await storage.listWatchlistEntries(otherEvmWallet);

    expect(otherEntries).toHaveLength(0);
  });

  it("distinguishes Stellar classic assets sharing a code across issuers", async () => {
    await persistence.__resetWatchlistPersistenceForTests();

    const issuerA = stellarWallet;
    const issuerB = "GBSAMRPJCNYUWDGVKJBLD7L3KZXBCJS2XO6FHKK3FGWYJ4VRSW4E7XZM";

    await storage.createWatchlistEntry({
      walletAddress: stellarWallet,
      chainFamily: "stellar",
      network: "stellar-pubnet",
      assetIdentifier: `USDC:${issuerA}`,
      assetType: "stellar_classic",
      symbol: "USDC",
    });

    await storage.createWatchlistEntry({
      walletAddress: stellarWallet,
      chainFamily: "stellar",
      network: "stellar-pubnet",
      assetIdentifier: `USDC:${issuerB}`,
      assetType: "stellar_classic",
      symbol: "USDC",
    });

    const all = await storage.listWatchlistEntries(stellarWallet);

    expect(all).toHaveLength(2);
  });

  it("cascades scan records when the entry is deleted", async () => {
    await persistence.__resetWatchlistPersistenceForTests();

    const entry = await storage.createWatchlistEntry({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "base",
      assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
      assetType: "evm_contract",
      symbol: "MEME",
    });

    await storage.createWatchlistScanRecord({
      watchlistEntryId: entry.id,
      walletAddress: entry.walletAddress,
      chainFamily: entry.chainFamily,
      network: entry.network,
      assetIdentifier: entry.assetIdentifier,
      assetType: entry.assetType,
      query: entry.assetIdentifier,
      symbol: entry.symbol,
      status: "complete",
      verdict: "watch",
      riskScore: 30,
      scanCompleted: true,
    });

    const removed = await storage.deleteWatchlistEntryForWallet(entry.id, evmWallet);

    expect(removed).toBe(true);

    const scans = await storage.listWatchlistScanRecordsForEntry(entry.id);

    expect(scans).toHaveLength(0);
  });

  it("records multiple immutable scan records and exposes them via list/get", async () => {
    await persistence.__resetWatchlistPersistenceForTests();

    const entry = await storage.createWatchlistEntry({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "base",
      assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
      assetType: "evm_contract",
      symbol: "MEME",
    });

    const first = await storage.createWatchlistScanRecord({
      watchlistEntryId: entry.id,
      walletAddress: entry.walletAddress,
      chainFamily: entry.chainFamily,
      network: entry.network,
      assetIdentifier: entry.assetIdentifier,
      assetType: entry.assetType,
      query: entry.assetIdentifier,
      symbol: entry.symbol,
      status: "complete",
      verdict: "watch",
      riskScore: 30,
      scanCompleted: true,
      createdAt: "2026-07-29T00:00:00.000Z",
    });

    const second = await storage.createWatchlistScanRecord({
      watchlistEntryId: entry.id,
      walletAddress: entry.walletAddress,
      chainFamily: entry.chainFamily,
      network: entry.network,
      assetIdentifier: entry.assetIdentifier,
      assetType: entry.assetType,
      query: entry.assetIdentifier,
      symbol: entry.symbol,
      status: "failed",
      failureReason: "RPC timeout",
      scanCompleted: false,
      createdAt: "2026-07-29T00:01:00.000Z",
    });

    const latest = await storage.getLatestScanForEntry(entry.id);

    expect(latest?.id).toBe(second.id);

    const previous = await storage.getPreviousScanForEntry(entry.id, second.id);

    expect(previous?.id).toBe(first.id);

    const all = await storage.listWatchlistScanRecordsForEntry(entry.id);

    expect(all.map((scan) => scan.id)).toEqual([second.id, first.id]);
  });

  it("counts both watchlist entries and scan records via getStorageCounts", async () => {
    await persistence.__resetWatchlistPersistenceForTests();
    await storage.createWatchlistEntry({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "base",
      assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
      assetType: "evm_contract",
      symbol: "MEME",
    });

    const counts = storage.getStorageCounts();

    expect(counts.watchlistEntries).toBe(1);
  });
});
