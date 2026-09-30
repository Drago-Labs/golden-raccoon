import { beforeEach, describe, expect, it, vi } from "vitest";
import { pool, wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));
vi.mock("@/server/research/lp-custody-inspector", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/lp-custody-inspector")>("@/server/research/lp-custody-inspector");
  return { ...actual, inspectLpCustody: mocks.inspect };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/lp-custody-inspector/route";

function request(body: unknown) {
  return new Request("http://localhost/api/insights/lp-custody-inspector", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("LP custody inspector route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.inspect.mockResolvedValue({ network: "ethereum", poolAddress: pool, blockNumber: 1, state: "complete", model: "constant_product_v2", token0: null, token1: null, reserves: null, totalSupply: null, candidates: [], summary: null, reorgDetected: false, warnings: [] });
  });

  it("passes validated input through to the service", async () => {
    const response = await POST(request({ walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", poolAddress: pool, candidates: [] }));
    expect(response.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalledWith(expect.objectContaining({ poolAddress: pool }));
  });

  it("rejects an invalid body before touching the service", async () => {
    const response = await POST(request({ walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", poolAddress: "bad" }));
    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("returns the wallet-session rejection before any provider read", async () => {
    mocks.session.mockReturnValue({ response: new Response(JSON.stringify({ error: "wallet_mismatch" }), { status: 403 }) });
    const response = await POST(request({ walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", poolAddress: pool, candidates: [] }));
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("maps an unavailable result to a 503", async () => {
    mocks.inspect.mockResolvedValue({ network: "ethereum", poolAddress: pool, blockNumber: null, state: "unavailable", model: "unknown_contract", token0: null, token1: null, reserves: null, totalSupply: null, candidates: [], summary: null, reorgDetected: false, warnings: ["Provider unavailable"] });
    const response = await POST(request({ walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", poolAddress: pool, candidates: [] }));
    expect(response.status).toBe(503);
  });
});
