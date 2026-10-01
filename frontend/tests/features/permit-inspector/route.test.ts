import { beforeEach, describe, expect, it, vi } from "vitest";
import { owner, token, wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));
vi.mock("@/server/research/permit-inspector", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/permit-inspector")>("@/server/research/permit-inspector");
  return { ...actual, inspectPermit: mocks.inspect };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/permit-inspector/route";

function request(body: unknown) {
  return new Request("http://localhost/api/insights/permit-inspector", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("permit inspector route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.inspect.mockResolvedValue({ network: "ethereum", chainId: 1, blockNumber: 1, tokenAddress: token, ownerAddress: owner, state: "complete", eip2612: null, permit2: null, warnings: [] });
  });

  it("passes validated input through to the service", async () => {
    const response = await POST(request({ walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", tokenAddress: token, ownerAddress: owner }));
    expect(response.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalledWith(expect.objectContaining({ tokenAddress: token, ownerAddress: owner }));
  });

  it("rejects an invalid body before touching the service", async () => {
    const response = await POST(request({ walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", tokenAddress: "bad", ownerAddress: owner }));
    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("returns the wallet-session rejection before any provider read", async () => {
    mocks.session.mockReturnValue({ response: new Response(JSON.stringify({ error: "wallet_mismatch" }), { status: 403 }) });
    const response = await POST(request({ walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", tokenAddress: token, ownerAddress: owner }));
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("maps an unavailable result to a 503", async () => {
    mocks.inspect.mockResolvedValue({ network: "ethereum", chainId: null, blockNumber: null, tokenAddress: token, ownerAddress: owner, state: "unavailable", eip2612: null, permit2: null, warnings: ["Provider unavailable"] });
    const response = await POST(request({ walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", tokenAddress: token, ownerAddress: owner }));
    expect(response.status).toBe(503);
  });
});
