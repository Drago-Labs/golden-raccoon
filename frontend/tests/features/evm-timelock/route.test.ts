import { beforeEach, describe, expect, it, vi } from "vitest";
import { timelockAddress, wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/evm-timelock", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/evm-timelock")>("@/server/research/evm-timelock");
  return { ...actual, inspectEvmTimelock: mocks.inspect };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/evm-timelock/route";

function request(body: unknown) {
  return new Request("http://localhost/api/insights/evm-timelock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  timelockAddress,
};

describe("evm-timelock route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.inspect.mockResolvedValue({ state: "complete" });
  });

  it("passes valid input to inspectEvmTimelock", async () => {
    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalled();
  });

  it("rejects malformed timelockAddress", async () => {
    const res = await POST(request({ ...validBody, timelockAddress: "bad" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when service reports unavailable", async () => {
    mocks.inspect.mockResolvedValue({ state: "unavailable" });
    const res = await POST(request(validBody));
    expect(res.status).toBe(503);
  });
});
