import { beforeEach, describe, expect, it, vi } from "vitest";
import { wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/ens-resolution", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/ens-resolution")>("@/server/research/ens-resolution");
  return { ...actual, verifyEnsResolution: mocks.verify };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/ens-resolution/route";

function request(body: unknown) {
  return new Request("http://localhost/api/insights/ens-resolution", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  ensName: "alice.eth",
};

describe("ens-resolution route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.verify.mockResolvedValue({ state: "complete" });
  });

  it("validates input and calls verifyEnsResolution", async () => {
    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalled();
  });

  it("rejects requests missing both ensName and targetAddress", async () => {
    const res = await POST(request({ walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when service reports unavailable", async () => {
    mocks.verify.mockResolvedValue({ state: "unavailable" });
    const res = await POST(request(validBody));
    expect(res.status).toBe(503);
  });
});
