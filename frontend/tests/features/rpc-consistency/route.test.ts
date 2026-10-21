import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matched, unavailable } from "./fixtures";

/**
 * The route calls the real service. Probes are replaced so the test covers
 * validation and the report shape without Horizon or RPC.
 */
const state = vi.hoisted(() => ({
  horizon: { status: "unavailable" as const, message: "unset" } as unknown,
  rpc: { status: "unavailable" as const, message: "unset" } as unknown,
}));

vi.mock("@/server/research/rpc-consistency/horizonProbe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/rpc-consistency/horizonProbe")>();

  return {
    ...actual,
    readHorizon: async () => state.horizon,
  };
});

vi.mock("@/server/research/rpc-consistency/rpcProbe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/rpc-consistency/rpcProbe")>();

  return {
    ...actual,
    readRpc: async () => state.rpc,
  };
});

const { POST } = await import("@/app/api/insights/rpc-consistency/route");

let sequence = 0;

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  sequence += 1;

  return new NextRequest("http://localhost/api/insights/rpc-consistency", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.1.0.${sequence}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  state.horizon = matched.horizon;
  state.rpc = matched.rpc;
  vi.stubGlobal("fetch", () => {
    throw new Error("network");
  });
});

describe("POST /api/insights/rpc-consistency", () => {
  it("returns a read-only report and does not cache it", async () => {
    const response = await POST(post(matched.request));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.readOnly).toBe(true);
    expect(payload.report.network).toBe("testnet");
    expect(payload.report.coverage.state).toBe("complete");
  });

  it("labels a single-source result when Horizon is unavailable", async () => {
    state.horizon = unavailable.horizon;
    state.rpc = unavailable.rpc;

    const response = await POST(post(unavailable.request));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.coverage.state).toBe("single_source");
    expect(payload.report.providers[0].label).toBe("Horizon unavailable");
  });

  it("rejects a request with no target", async () => {
    const response = await POST(post({ network: "testnet" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects a target that is not a Stellar strkey", async () => {
    const response = await POST(post({ network: "testnet", target: "hello" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_target" });
  });

  it("rejects a network other than testnet or mainnet", async () => {
    const response = await POST(post({ network: "futurenet", target: matched.request.target }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects a body over the published byte limit", async () => {
    const response = await POST(post(matched.request, { "content-length": "999999" }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "payload_too_large" });
  });

  it("does not compare a testnet observation against a mainnet request", async () => {
    const response = await POST(post({ ...matched.request, network: "mainnet" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "network_mismatch" });
  });
});
