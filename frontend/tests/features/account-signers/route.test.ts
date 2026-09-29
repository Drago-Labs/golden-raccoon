import { beforeEach, describe, expect, it, vi } from "vitest";
import { wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  session: vi.fn(),
  authz: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("@/server/research/account-signers", async () => ({
  ...(await vi.importActual<typeof import("@/server/research/account-signers")>("@/server/research/account-signers")),
  inspectAccountSigners: mocks.inspect,
}));
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/account-signers/route";

describe("account-signers route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.inspect.mockResolvedValue({
      walletAddress: wallet,
      accountAddress: wallet,
      network: "stellar-testnet",
      state: "complete",
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
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: wallet }));
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
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
});
