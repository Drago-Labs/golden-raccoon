import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STABLECOIN_FLOW_LIMITS } from "@/server/research/stablecoin-flows/limits";
import { flowRequest } from "./fixtures";

const mocks = vi.hoisted(() => ({ track: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/stablecoin-flows", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/stablecoin-flows")>(
    "@/server/research/stablecoin-flows",
  );
  return { ...actual, trackStablecoinFlows: mocks.track };
});
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/stablecoin-flows/route";
import { StablecoinFlowError } from "@/server/research/stablecoin-flows/errors";

function request(body: unknown, options: { raw?: string; contentLength?: number } = {}) {
  const payload = options.raw ?? JSON.stringify(body);
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("content-length", String(options.contentLength ?? Buffer.byteLength(payload)));
  return new Request("http://localhost/api/insights/stablecoin-flows", {
    method: "POST",
    headers,
    body: payload,
  }) as unknown as NextRequest;
}

const ready = {
  state: "ready",
  report: { state: "complete", daily: [], netIssuance: { net: "0" }, coverage: [], notes: [], readOnly: true },
};

describe("stablecoin-flows route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.track.mockResolvedValue(ready);
  });

  it("passes the validated request to the service and never caches the answer", async () => {
    const response = await POST(request(flowRequest()));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({ assetId: "usdc" }));
    await expect(response.json()).resolves.toEqual(ready);
  });

  it("returns the rate limiter's own response before doing any work", async () => {
    mocks.rate.mockReturnValue(new Response(null, { status: 429 }));
    const response = await POST(request(flowRequest()));
    expect(response.status).toBe(429);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("rejects a body over the documented limit without reading it", async () => {
    const response = await POST(
      request(flowRequest(), { contentLength: STABLECOIN_FLOW_LIMITS.maxRequestBytes + 1 }),
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "payload_too_large" });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const response = await POST(request(null, { raw: "{not json" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("reports an unreadable asset as 503 rather than an error", async () => {
    mocks.track.mockResolvedValue({ state: "unavailable", report: ready.report, reason: "nothing could be read" });
    const response = await POST(request(flowRequest()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ reason: "nothing could be read" });
  });

  it("maps each typed feature error to 400 with its own code", async () => {
    for (const [code, message] of [
      ["invalid_request", "The stablecoin-flow request is invalid."],
      ["unknown_asset", 'No stablecoin is configured under the id "doge".'],
      ["unsupported_chain", 'USDC is not configured on "solana".'],
    ] as const) {
      mocks.track.mockRejectedValue(new StablecoinFlowError(code, message));
      const response = await POST(request(flowRequest()));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: code, message });
    }
  });

  it("does not leak an unexpected failure to the client", async () => {
    mocks.track.mockRejectedValue(new Error("RPC key missing: SECRET"));
    const response = await POST(request(flowRequest()));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "flow_read_failed",
      message: "The recorded mint and burn evidence could not be read.",
    });
  });
});
