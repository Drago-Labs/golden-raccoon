import { beforeEach, describe, expect, it, vi } from "vitest";
import { walletA, walletB, contract } from "./fixtures";

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  session: vi.fn(),
  authz: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("@/server/research/authority-history", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/authority-history")>(
    "@/server/research/authority-history",
  );
  return { ...actual, buildAuthorityHistory: mocks.history };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/authority-history/route";

function post(body: unknown) {
  return new Request("http://localhost/api/insights/authority-history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/authority-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet: walletA });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.history.mockResolvedValue({
      schemaVersion: "authority-history/2026-01",
      walletAddress: walletA,
      network: "ethereum",
      contractAddress: contract,
      events: [],
      timeline: [],
      roleMatrix: [],
      roleAdmins: [],
      observedOwners: [],
      coverage: {
        state: "empty",
        fromBlock: "1",
        toBlock: "2",
        snapshotBlock: "2",
        eventCount: 0,
        truncated: false,
        logCoverageComplete: true,
        reorgDetected: false,
        missingBlockHashes: 0,
        unsupportedModels: [],
        providerLimitations: [],
        reconstructionValid: true,
        message: "empty",
      },
      generatedAt: "now",
      readOnly: true,
      authorityUnchanged: true,
    });
  });

  it("uses the authenticated wallet as the authoritative caller", async () => {
    const response = await POST(
      post({
        walletAddress: walletA,
        network: "ethereum",
        contractAddress: contract,
        fromBlock: "1",
        toBlock: "2",
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.history).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: walletA }));
  });

  it("returns the wallet-session rejection before any provider read", async () => {
    mocks.session.mockReturnValue({
      response: new Response(JSON.stringify({ error: "wallet_mismatch" }), { status: 403 }),
    });
    const response = await POST(
      post({
        walletAddress: walletB,
        network: "ethereum",
        contractAddress: contract,
        fromBlock: "1",
        toBlock: "2",
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("rejects invalid requests without calling the service", async () => {
    const response = await POST(
      post({
        walletAddress: walletA,
        network: "not-a-chain",
        contractAddress: contract,
        fromBlock: "1",
        toBlock: "2",
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("surfaces service failures as route errors", async () => {
    mocks.history.mockRejectedValue(new Error("RPC down"));
    const response = await POST(
      post({
        walletAddress: walletA,
        network: "ethereum",
        contractAddress: contract,
        fromBlock: "1",
        toBlock: "2",
      }),
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("authority_history_unavailable");
  });
});
