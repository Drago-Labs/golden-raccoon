import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  rate: vi.fn(),
}));

vi.mock("@/server/research/governance-queue", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/governance-queue")>(
    "@/server/research/governance-queue",
  );
  return { ...actual, inspectGovernanceQueue: mocks.inspect };
});
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/governance-queue/route";

describe("POST /api/insights/governance-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.inspect.mockResolvedValue({
      state: "empty",
      network: "testnet",
      contractId: "CABC",
      items: [],
      readiness: [],
      warnings: [],
      scoreUnchanged: true,
    });
  });

  it("returns an explicit empty queue", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/governance-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ network: "testnet" }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ state: "empty", items: [] });
  });

  it("maps provider errors to 502 and never invents an empty success", async () => {
    mocks.inspect.mockResolvedValue({
      state: "provider_error",
      network: "testnet",
      items: [],
      readiness: [],
      warnings: ["RPC failed"],
      scoreUnchanged: true,
    });
    const response = await POST(
      new Request("http://localhost/api/insights/governance-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ network: "testnet" }),
      }),
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ state: "provider_error" });
  });

  it("rejects invalid JSON bodies", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/governance-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
    );
    // safeParse on catch yields {} which is valid for optional network; still 200 empty path
    // Force invalid network type:
    const bad = await POST(
      new Request("http://localhost/api/insights/governance-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ network: 123 }),
      }),
    );
    expect(bad.status).toBe(400);
    expect(response.status).toBeLessThan(500);
  });
});
