import { beforeEach, describe, expect, it, vi } from "vitest";
import { wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ analyze: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/holding-correlation", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/holding-correlation")>(
    "@/server/research/holding-correlation",
  );
  return { ...actual, analyzeHoldingCorrelation: mocks.analyze };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/holding-correlation/route";

function request(body: unknown) {
  return new Request("http://localhost/api/insights/holding-correlation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  windowDays: 30,
  clusterThreshold: 0.75,
};

describe("holding-correlation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.analyze.mockResolvedValue({ state: "complete", pairs: [], clusters: [], exclusions: [] });
  });

  it("validates input and calls analyzeHoldingCorrelation", async () => {
    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    expect(mocks.analyze).toHaveBeenCalled();
  });

  it("returns 400 when windowDays is out of bounds", async () => {
    const res = await POST(request({ ...validBody, windowDays: 0 }));
    expect(res.status).toBe(400);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("returns 503 when service reports unavailable", async () => {
    mocks.analyze.mockResolvedValue({ state: "unavailable" });
    const res = await POST(request(validBody));
    expect(res.status).toBe(503);
  });
});
