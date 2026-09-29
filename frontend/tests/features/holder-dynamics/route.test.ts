import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  session: vi.fn(),
  authz: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("@/server/research/holder-dynamics", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/holder-dynamics")>(
    "@/server/research/holder-dynamics",
  );
  return { ...actual, analyzeHolderDynamics: mocks.analyze };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/holder-dynamics/route";

const wallet = "0x1111111111111111111111111111111111111111";
const token = "0x00000000000000000000000000000000000000ff";

describe("POST /api/insights/holder-dynamics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.analyze.mockResolvedValue({
      state: "complete",
      network: "ethereum",
      tokenAddress: token,
      holders: [],
      movements: [],
      warnings: [],
      scoreUnchanged: true,
    });
  });

  it("rejects invalid requests before analysis", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/holder-dynamics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, network: "ethereum" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("returns analysis for an authenticated wallet", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/holder-dynamics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          network: "ethereum",
          walletNetwork: "ethereum",
          tokenAddress: token,
          fromBlock: 100,
          toBlock: 110,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.analyze).toHaveBeenCalled();
  });

  it("maps unavailable analysis to 503", async () => {
    mocks.analyze.mockResolvedValue({ state: "unavailable", holders: [], movements: [], warnings: [], scoreUnchanged: true });
    const response = await POST(
      new Request("http://localhost/api/insights/holder-dynamics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          network: "ethereum",
          walletNetwork: "ethereum",
          tokenAddress: token,
          fromBlock: 100,
          toBlock: 110,
        }),
      }),
    );
    expect(response.status).toBe(503);
  });
});
