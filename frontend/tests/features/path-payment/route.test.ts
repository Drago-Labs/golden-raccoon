import { beforeEach, describe, expect, it, vi } from "vitest";
import { issuerA, wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  session: vi.fn(),
  authz: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("@/server/research/path-payment", async () => ({
  ...(await vi.importActual<typeof import("@/server/research/path-payment")>("@/server/research/path-payment")),
  inspectPathPayment: mocks.inspect,
}));
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/path-payment/route";

describe("path-payment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.inspect.mockResolvedValue({
      walletAddress: wallet,
      network: "stellar-testnet",
      state: "partial",
    });
  });

  it("uses session wallet", async () => {
    const response = await POST(
      new Request("http://x/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          network: "stellar-testnet",
          walletNetwork: "stellar-testnet",
          mode: "strict_send",
          sourceAsset: "XLM",
          destinationAsset: `USD:${issuerA}`,
          amount: "1.0000000",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalled();
  });

  it("stops before provider on session rejection", async () => {
    mocks.session.mockReturnValue({ response: new Response("forbidden", { status: 403 }) });
    const response = await POST(
      new Request("http://x/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          network: "stellar-testnet",
          walletNetwork: "stellar-testnet",
          mode: "strict_send",
          sourceAsset: "XLM",
          destinationAsset: `USD:${issuerA}`,
          amount: "1.0000000",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
});
