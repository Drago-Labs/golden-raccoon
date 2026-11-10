import { beforeEach, describe, expect, it, vi } from "vitest";
import { TX_HASH } from "./fixtures";

const mocks = vi.hoisted(() => ({ trace: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/call-tree", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/call-tree")>(
    "@/server/research/call-tree",
  );
  return { ...actual, traceCallTree: mocks.trace };
});
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/call-tree/route";

function post(body: unknown) {
  return new Request("http://localhost/api/insights/call-tree", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/insights/call-tree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.trace.mockResolvedValue({ state: "complete", roots: [] });
  });

  it("validates 64-char hex hash and returns 200", async () => {
    const res = await POST(post({ txHash: TX_HASH, network: "stellar-testnet" }));
    expect(res.status).toBe(200);
    expect(mocks.trace).toHaveBeenCalled();
  });

  it("returns 400 on malformed transaction hash", async () => {
    const res = await POST(post({ txHash: "not-a-hash", network: "stellar-testnet" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when service reports unavailable", async () => {
    mocks.trace.mockResolvedValue({ state: "unavailable" });
    const res = await POST(post({ txHash: TX_HASH, network: "stellar-testnet" }));
    expect(res.status).toBe(503);
  });
});
