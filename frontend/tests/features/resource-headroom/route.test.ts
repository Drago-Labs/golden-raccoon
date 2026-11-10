import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTRACT_ID } from "./fixtures";

const mocks = vi.hoisted(() => ({ compare: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/resource-headroom", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/resource-headroom")>(
    "@/server/research/resource-headroom",
  );
  return { ...actual, compareResourceHeadroom: mocks.compare };
});
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/resource-headroom/route";

function post(body: unknown) {
  return new Request("http://localhost/api/insights/resource-headroom", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/insights/resource-headroom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.compare.mockResolvedValue({ state: "complete", resources: [] });
  });

  it("validates request and returns 200", async () => {
    const res = await POST(
      post({
        mode: "simulation",
        contractId: CONTRACT_ID,
        functionName: "swap",
        network: "stellar-testnet",
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.compare).toHaveBeenCalled();
  });

  it("returns 400 when warningThresholdPct is out of bounds", async () => {
    const res = await POST(
      post({
        mode: "simulation",
        contractId: CONTRACT_ID,
        functionName: "swap",
        warningThresholdPct: 200,
        network: "stellar-testnet",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when service reports unavailable", async () => {
    mocks.compare.mockResolvedValue({ state: "unavailable" });
    const res = await POST(
      post({
        mode: "simulation",
        contractId: CONTRACT_ID,
        functionName: "swap",
        network: "stellar-testnet",
      }),
    );
    expect(res.status).toBe(503);
  });
});
