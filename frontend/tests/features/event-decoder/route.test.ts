import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTRACT_ID } from "./fixtures";

const mocks = vi.hoisted(() => ({ decode: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/event-decoder", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/event-decoder")>(
    "@/server/research/event-decoder",
  );
  return { ...actual, decodeContractEvents: mocks.decode };
});
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/event-decoder/route";

function post(body: unknown) {
  return new Request("http://localhost/api/insights/event-decoder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/insights/event-decoder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.decode.mockResolvedValue({ state: "complete", events: [] });
  });

  it("validates request and returns 200", async () => {
    const res = await POST(
      post({
        contractId: CONTRACT_ID,
        startLedger: 900000,
        endLedger: 900500,
        network: "stellar-testnet",
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.decode).toHaveBeenCalled();
  });

  it("returns 400 when endLedger < startLedger", async () => {
    const res = await POST(
      post({
        contractId: CONTRACT_ID,
        startLedger: 900500,
        endLedger: 900000,
        network: "stellar-testnet",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when service reports unavailable", async () => {
    mocks.decode.mockResolvedValue({ state: "unavailable" });
    const res = await POST(
      post({
        contractId: CONTRACT_ID,
        startLedger: 900000,
        endLedger: 900500,
        network: "stellar-testnet",
      }),
    );
    expect(res.status).toBe(503);
  });
});
