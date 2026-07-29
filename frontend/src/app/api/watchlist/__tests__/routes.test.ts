import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the scan pipeline so we can drive success and failure deterministically
// without touching the real providers.
const runTokenScan = vi.fn();

vi.mock("@/server/scan/tokenScan", () => ({
  runTokenScan: (...args: unknown[]) => runTokenScan(...args),
}));

// Test isolation: each suite relies on src/test/setup.ts to point
// WATCHLIST_DATA_DIR at a per-process temp directory.

const { POST: addEntry } = await import("@/app/api/watchlist/route");
const { GET: listEntries } = await import("@/app/api/watchlist/route");
const { DELETE: deleteEntry, POST: rescanEntry } = await import("@/app/api/watchlist/[id]/route");
const persistence = await import("@/server/storage/persistence");

const evmWallet = "0x000000000000000000000000000000000000dEaD";

function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init);
}

beforeEach(() => {
  runTokenScan.mockReset();
});

afterEach(async () => {
  await persistence.__resetWatchlistPersistenceForTests();
});

describe("GET /api/watchlist", () => {
  it("returns 400 when walletAddress is missing", async () => {
    const response = await listEntries(makeRequest("http://localhost/api/watchlist") as never);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };

    expect(body.error).toBe("missing_wallet");
  });

  it("returns 400 when walletAddress is malformed", async () => {
    const response = await listEntries(makeRequest(`http://localhost/api/watchlist?walletAddress=garbage`) as never);

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };

    expect(body.error).toBe("invalid_wallet_address");
  });

  it("lists only the entries owned by the requested wallet", async () => {
    await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "base",
          assetType: "evm_contract",
          assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
          symbol: "MEME",
        }),
      }) as never,
    );

    const response = await listEntries(makeRequest(`http://localhost/api/watchlist?walletAddress=${evmWallet}`) as never);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ symbol: string }>;

    expect(body).toHaveLength(1);
    expect(body[0].symbol).toBe("MEME");
  });

  it("refuses listing without a walletAddress (no implicit all-wallet dump)", async () => {
    await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "base",
          assetType: "evm_contract",
          assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
          symbol: "MEME",
        }),
      }) as never,
    );

    const response = await listEntries(makeRequest("http://localhost/api/watchlist") as never);

    expect(response.status).toBe(400);
  });
});

describe("POST /api/watchlist", () => {
  it("creates an entry on a valid payload", async () => {
    const response = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "base",
          assetType: "evm_contract",
          assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
          symbol: "MEME",
        }),
      }) as never,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { assetIdentifier: string; symbol: string };

    expect(body.assetIdentifier).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
    expect(body.symbol).toBe("MEME");
  });

  it("rejects an invalid EVM contract address with 400 + stable error code", async () => {
    const response = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "base",
          assetType: "evm_contract",
          assetIdentifier: "not-a-0x-address",
          symbol: "MEME",
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };

    expect(body.error).toBe("invalid_evm_address");
  });

  it("accepts native XLM with an empty asset identifier and forces it to 'native'", async () => {
    const stellar = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACR6";
    const response = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: stellar,
          chainFamily: "stellar",
          network: "stellar-pubnet",
          assetType: "stellar_native",
          assetIdentifier: "",
          symbol: "XLM",
        }),
      }) as never,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { assetIdentifier: string };

    expect(body.assetIdentifier).toBe("native");
  });

  it("returns 409 when the same identity is added twice", async () => {
    const payload = {
      walletAddress: evmWallet,
      chainFamily: "evm" as const,
      network: "base" as const,
      assetType: "evm_contract" as const,
      assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12" as const,
      symbol: "MEME",
    };

    const first = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }) as never,
    );

    expect(first.status).toBe(201);

    const second = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }) as never,
    );

    expect(second.status).toBe(409);
    const body = (await second.json()) as { error?: string };

    expect(body.error).toBe("duplicate_entry");
  });

  it("allows the same address on a different network", async () => {
    const a = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "base",
          assetType: "evm_contract",
          assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
          symbol: "MEME",
        }),
      }) as never,
    );

    const b = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "ethereum",
          assetType: "evm_contract",
          assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
          symbol: "MEME",
        }),
      }) as never,
    );

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });
});

describe("DELETE /api/watchlist/[id]", () => {
  it("requires walletAddress", async () => {
    const addResp = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "base",
          assetType: "evm_contract",
          assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
          symbol: "MEME",
        }),
      }) as never,
    );
    const entry = (await addResp.json()) as { id: string };

    const response = await deleteEntry(
      makeRequest(`http://localhost/api/watchlist/${entry.id}`, { method: "DELETE" }) as never,
      { params: Promise.resolve({ id: entry.id }) },
    );

    expect(response.status).toBe(400);
  });

  it("refuses deletion when the requester does not own the entry", async () => {
    const addResp = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "base",
          assetType: "evm_contract",
          assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
          symbol: "MEME",
        }),
      }) as never,
    );
    const entry = (await addResp.json()) as { id: string };
    const intruder = "0x000000000000000000000000000000000000c0FFEE";

    const response = await deleteEntry(
      makeRequest(`http://localhost/api/watchlist/${entry.id}?walletAddress=${intruder}`, { method: "DELETE" }) as never,
      { params: Promise.resolve({ id: entry.id }) },
    );

    expect(response.status).toBe(404);
  });

  it("deletes an entry when the owning walletAddress is supplied", async () => {
    const addResp = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "base",
          assetType: "evm_contract",
          assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
          symbol: "MEME",
        }),
      }) as never,
    );
    const entry = (await addResp.json()) as { id: string };

    const response = await deleteEntry(
      makeRequest(`http://localhost/api/watchlist/${entry.id}?walletAddress=${evmWallet}`, { method: "DELETE" }) as never,
      { params: Promise.resolve({ id: entry.id }) },
    );

    expect(response.status).toBe(200);
  });
});

describe("POST /api/watchlist/[id] rescan", () => {
  async function seed() {
    const addResp = await addEntry(
      makeRequest("http://localhost/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: evmWallet,
          chainFamily: "evm",
          network: "base",
          assetType: "evm_contract",
          assetIdentifier: "0xabcdef1234567890abcdef1234567890abcdef12",
          symbol: "MEME",
        }),
      }) as never,
    );

    return (await addResp.json()) as { id: string };
  }

  it("creates an immutable scan record on success and links the entry", async () => {
    const entry = await seed();
    runTokenScan.mockResolvedValueOnce({
      symbol: "MEME",
      tokenAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
      chain: "base",
      verdict: "watch",
      overallRiskScore: 42,
      summary: "ok",
      scannedAt: new Date().toISOString(),
      sources: [{ label: "scan", status: "connected", detail: "ok" }],
      dataQuality: { mode: "live", connectedSources: 1, unavailableSources: 0, mockSources: 0, sourceCount: 1, reliability: 0.9, detail: "ok" },
      riskReport: { id: "report_1" },
    });

    const response = await rescanEntry(
      makeRequest(`http://localhost/api/watchlist/${entry.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescan", walletAddress: evmWallet }),
      }) as never,
      { params: Promise.resolve({ id: entry.id }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { scanRecordId: string; entry: { latestScanId: string; latestVerdict: string } };

    expect(body.scanRecordId).toBeTruthy();
    expect(body.entry.latestScanId).toBe(body.scanRecordId);
    expect(body.entry.latestVerdict).toBe("watch");
  });

  it("preserves the prior scan when the new rescan throws", async () => {
    const entry = await seed();
    runTokenScan.mockResolvedValueOnce({
      symbol: "MEME",
      verdict: "safe",
      overallRiskScore: 10,
      summary: "first ok",
      scannedAt: new Date().toISOString(),
      sources: [{ label: "scan", status: "connected", detail: "ok" }],
      dataQuality: { mode: "live", connectedSources: 1, unavailableSources: 0, mockSources: 0, sourceCount: 1, reliability: 0.9, detail: "ok" },
      riskReport: { id: "report_first" },
    });

    const first = await rescanEntry(
      makeRequest(`http://localhost/api/watchlist/${entry.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescan", walletAddress: evmWallet }),
      }) as never,
      { params: Promise.resolve({ id: entry.id }) },
    );

    const firstBody = (await first.json()) as { scanRecordId: string };

    runTokenScan.mockRejectedValueOnce(new Error("RPC down"));

    const second = await rescanEntry(
      makeRequest(`http://localhost/api/watchlist/${entry.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescan", walletAddress: evmWallet }),
      }) as never,
      { params: Promise.resolve({ id: entry.id }) },
    );

    expect(second.status).toBe(502);
    const secondBody = (await second.json()) as {
      error: string;
      scanRecordId: string;
      entry: { latestScanId: string; previousScanId?: string; latestVerdict?: string; previousScanAvailable: boolean };
    };

    expect(secondBody.error).toBe("scan_failed");
    expect(secondBody.scanRecordId).toBeTruthy();
    // A new failed record is created, and the previous successful one is preserved.
    expect(secondBody.entry.latestScanId).toBe(secondBody.scanRecordId);
    expect(secondBody.entry.previousScanId).toBe(firstBody.scanRecordId);
    expect(secondBody.entry.previousScanAvailable).toBe(true);
    expect(secondBody.entry.latestVerdict).toBe("safe");
  });

  it("refuses rescan when walletAddress does not own the entry", async () => {
    const entry = await seed();
    const intruder = "0x000000000000000000000000000000000000c0FFEE";

    const response = await rescanEntry(
      makeRequest(`http://localhost/api/watchlist/${entry.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescan", walletAddress: intruder }),
      }) as never,
      { params: Promise.resolve({ id: entry.id }) },
    );

    expect(response.status).toBe(404);
  });
});
