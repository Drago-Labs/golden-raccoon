import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { runTokenScan } = vi.hoisted(() => ({
  runTokenScan: vi.fn(),
}));

vi.mock("@/server/scan/tokenScan", () => ({ runTokenScan }));

const { POST: addEntry, GET: listEntries } = await import("@/app/api/watchlist/route");
const { POST: rescanEntry } = await import("@/app/api/watchlist/[id]/route");
const persistence = await import("@/server/storage/persistence");
const rateLimit = await import("@/server/security/rateLimit");

const evmWallet = "0x000000000000000000000000000000000000dEaD";

function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init);
}

function makeListUrl(wallet: string) {
  return makeRequest(`http://localhost/api/watchlist?walletAddress=${wallet}`) as never;
}

beforeEach(() => {
  rateLimit.__resetRateLimitBucketsForTests();
});

afterEach(async () => {
  await persistence.__resetWatchlistPersistenceForTests();
});

async function seedEntry(symbol: string, network = "base") {
  const response = await addEntry(
    makeRequest("http://localhost/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: evmWallet,
        chainFamily: "evm",
        network,
        assetType: "evm_contract",
        assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
        symbol,
      }),
    }) as never,
  );

  if (response.status !== 201) {
    throw new Error(`Seed failed with ${response.status}`);
  }

  return (await response.json()) as { id: string };
}

describe("watchlist write rate limit (watchlist:write, 30/min)", () => {
  it("returns 429 after the 31st POST within a minute", async () => {
    // Use distinct, valid EVM addresses so each request fails for a clean reason
    // (duplicate-detection) rather than by accident consuming the bucket while
    // returning 400. The 31st call is identical to the first and would otherwise
    // hit duplicate detection — but the bucket fills first.
    for (let i = 0; i < 30; i += 1) {
      const lastByte = i.toString(16).padStart(1, "0");
      const address = `0x00000000000000000000000000000000000000${lastByte}`.slice(0, 42);

      const response = await addEntry(
        makeRequest("http://localhost/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: address,
            chainFamily: "evm",
            network: "base",
            assetType: "evm_contract",
            assetIdentifier: `0xabcdef1234567890abcdef1234567890abcd${lastByte}`.slice(0, 42),
            symbol: `T${i}`,
          }),
        }) as never,
      );

      expect(response.status).toBeLessThan(429);
    }

    const overflow = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "base",
          assetType: "evm_contract",
          assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
          symbol: "OVERFLOW",
        }),
      }) as never,
    );

    expect(overflow.status).toBe(429);
    const body = (await overflow.json()) as { error?: string };

    expect(body.error).toBe("rate_limited");
  });
});

describe("watchlist rescan rate limit (watchlist:rescan, 10/min)", () => {
  it("returns 429 after the 11th rescan within a minute", async () => {
    const entry = await seedEntry("MEME");

    runTokenScan.mockResolvedValue({
      symbol: "MEME",
      verdict: "watch",
      overallRiskScore: 30,
      summary: "ok",
      scannedAt: new Date().toISOString(),
      sources: [{ label: "scan", status: "connected", detail: "ok" }],
      dataQuality: { mode: "live", connectedSources: 1, unavailableSources: 0, mockSources: 0, sourceCount: 1, reliability: 0.9, detail: "ok" },
    });

    for (let i = 0; i < 10; i += 1) {
      const response = await rescanEntry(
        makeRequest(`http://localhost/api/watchlist/${entry.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rescan", walletAddress: evmWallet }),
        }) as never,
        { params: Promise.resolve({ id: entry.id }) },
      );

      expect(response.status).toBeLessThan(429);
    }

    const overflow = await rescanEntry(
      makeRequest(`http://localhost/api/watchlist/${entry.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescan", walletAddress: evmWallet }),
      }) as never,
      { params: Promise.resolve({ id: entry.id }) },
    );

    expect(overflow.status).toBe(429);
    expect(overflow.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("watchlist read rate limit (watchlist:read, 80/min)", () => {
  it("returns the configured 429 once the 81st GET is fired within a minute", async () => {
    await seedEntry("MEME");

    for (let i = 0; i < 80; i += 1) {
      const response = await listEntries(makeListUrl(evmWallet));

      expect(response.status).toBeLessThan(429);
    }

    const overflow = await listEntries(makeListUrl(evmWallet));

    expect(overflow.status).toBe(429);
  });
});

describe("watchlist rate-limit profile contract", () => {
  it("exposes the documented profiles from rateLimit.ts", () => {
    expect(rateLimit.rateLimitProfiles.watchlistRescan.limit).toBe(10);
    expect(rateLimit.rateLimitProfiles.watchlistWrite.limit).toBe(30);
    expect(rateLimit.rateLimitProfiles.watchlistRescan.namespace).toBe("watchlist:rescan");
    expect(rateLimit.rateLimitProfiles.watchlistWrite.namespace).toBe("watchlist:write");
  });
});
