import { beforeEach, describe, expect, it, vi } from "vitest";
import { nestedSimulation, wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  session: vi.fn(),
  authz: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("@/server/research/soroban-auth-footprint", async () => ({
  ...(await vi.importActual<typeof import("@/server/research/soroban-auth-footprint")>(
    "@/server/research/soroban-auth-footprint",
  )),
  inspectSorobanAuthFootprint: mocks.inspect,
}));
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/soroban-auth-footprint/route";

describe("soroban-auth-footprint route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.inspect.mockResolvedValue({
      walletAddress: wallet,
      network: "stellar-testnet",
      state: "partial",
      decodingIsNotApproval: true,
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
          simulationJson: nestedSimulation,
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
          simulationJson: nestedSimulation,
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
});
