import { beforeEach, describe, expect, it, vi } from "vitest";
import { distributorAddress, wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/merkle-claims", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/merkle-claims")>("@/server/research/merkle-claims");
  return { ...actual, verifyMerkleClaim: mocks.verify };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/merkle-claims/route";

function request(body: unknown) {
  return new Request("http://localhost/api/insights/merkle-claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const claimAddress = `0x${"a".repeat(40)}`;
const validBody = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  distributorAddress,
  claimAddress,
  treeSource: "https://example.com/tree.json",
  leafEncoding: "index-account-amount-packed",
};

const sampleResult = {
  network: "ethereum",
  distributorAddress,
  claimAddress,
  state: "complete",
  onChainRoot: `0x${"1".repeat(64)}`,
  token: "0x2222222222222222222222222222222222222222",
  tree: { loaded: true, source: validBody.treeSource, fileReportedRoot: `0x${"1".repeat(64)}`, entryIndex: 0, entryAmount: "100", proofLength: 1 },
  proof: { leaf: `0x${"2".repeat(64)}`, computedRoot: `0x${"1".repeat(64)}`, valid: true, reason: "proof folds up to the on-chain root" },
  claim: { inTree: true, proofValid: true, fileReportedRootMatchesChain: true, alreadyClaimed: false, eligible: true, reason: "eligible" },
  coverage: { onChainRootRead: true, treeLoaded: true, proofChecked: true, claimStatusRead: true },
  warnings: [],
};

describe("merkle-claims route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.verify.mockResolvedValue(sampleResult);
  });

  it("passes validated input through to the service", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({ distributorAddress, claimAddress }));
  });

  it("rejects an invalid body before touching the service", async () => {
    const response = await POST(request({ ...validBody, distributorAddress: "not-an-address" }));
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("rejects a leaf encoding that is not one of the known values", async () => {
    const response = await POST(request({ ...validBody, leafEncoding: "made-up-encoding" }));
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("rejects a request missing a tree source", async () => {
    const response = await POST(request({ ...validBody, treeSource: "" }));
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("rejects a network mismatch between network and walletNetwork", async () => {
    const response = await POST(request({ ...validBody, walletNetwork: "base" }));
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("returns 403 when the wallet session does not authorize the request", async () => {
    mocks.authz.mockReturnValue({ allowed: false, reason: "resource_owner_mismatch" });
    const response = await POST(request(validBody));
    expect(response.status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("returns the session's own response when no wallet session exists", async () => {
    const forbidden = new Response(null, { status: 403 });
    mocks.session.mockReturnValue({ response: forbidden });
    const response = await POST(request(validBody));
    expect(response.status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("returns 503 when the service reports the provider as unavailable", async () => {
    mocks.verify.mockResolvedValue({ ...sampleResult, state: "unavailable" });
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
  });

  it("sets a no-store cache header", async () => {
    const response = await POST(request(validBody));
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
