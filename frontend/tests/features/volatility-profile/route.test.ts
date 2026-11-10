import { beforeEach, describe, expect, it, vi } from "vitest";
import { wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/volatility-profile", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/volatility-profile")>(
    "@/server/research/volatility-profile",
  );
  return { ...actual, profileAssetVolatility: mocks.profile };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/volatility-profile/route";

function request(body: unknown) {
  return new Request("http://localhost/api/insights/volatility-profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  assetSymbol: "XLM",
  interval: "1d",
  windowDays: 30,
};

describe("volatility-profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.profile.mockResolvedValue({ state: "complete" });
  });

  it("validates input and calls profileAssetVolatility", async () => {
    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    expect(mocks.profile).toHaveBeenCalled();
  });

  it("rejects invalid windowDays", async () => {
    const res = await POST(request({ ...validBody, windowDays: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when service reports unavailable", async () => {
    mocks.profile.mockResolvedValue({ state: "unavailable" });
    const res = await POST(request(validBody));
    expect(res.status).toBe(503);
  });
});
