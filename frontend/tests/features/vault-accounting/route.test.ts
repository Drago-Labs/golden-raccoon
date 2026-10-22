import { beforeEach, describe, expect, it, vi } from "vitest";
import { vaultAddress, wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/vault-accounting", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/vault-accounting")>("@/server/research/vault-accounting");
  return { ...actual, inspectVaultAccounting: mocks.inspect };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/vault-accounting/route";

function request(body: unknown) {
  return new Request("http://localhost/api/insights/vault-accounting", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  vaultAddress,
  sampleAmounts: [],
};

const sampleResult = {
  network: "ethereum",
  vaultAddress,
  blockNumber: 100,
  state: "complete",
  conformance: { conforming: true, missing: [] },
  asset: null,
  totalAssets: null,
  totalSupply: null,
  sharePrice: null,
  roundingSamples: [],
  underlyingBalance: null,
  priceSamples: [],
  priceJumps: [],
  coverage: {
    reachedProvider: true,
    conformance: { conforming: true, missing: [] },
    roundingSamplesRequested: 0,
    roundingSamplesAvailable: 0,
    priceSamplesRequested: 5,
    priceSamplesAvailable: 5,
  },
  warnings: [],
};

describe("vault-accounting route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.inspect.mockResolvedValue(sampleResult);
  });

  it("passes validated input through to the service", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalledWith(expect.objectContaining({ vaultAddress }));
  });

  it("rejects an invalid body before touching the service", async () => {
    const response = await POST(request({ ...validBody, vaultAddress: "not-an-address" }));
    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("rejects more than the maximum number of sample amounts", async () => {
    const response = await POST(request({ ...validBody, sampleAmounts: ["1", "2", "3", "4", "5", "6"] }));
    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("returns 403 when the wallet session does not authorize the request", async () => {
    mocks.authz.mockReturnValue({ allowed: false, reason: "resource_owner_mismatch" });
    const response = await POST(request(validBody));
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("returns the session's own response when no wallet session exists", async () => {
    const forbidden = new Response(null, { status: 403 });
    mocks.session.mockReturnValue({ response: forbidden });
    const response = await POST(request(validBody));
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("returns 503 when the service reports the provider as unavailable", async () => {
    mocks.inspect.mockResolvedValue({ ...sampleResult, state: "unavailable" });
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
  });

  it("sets a no-store cache header", async () => {
    const response = await POST(request(validBody));
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
