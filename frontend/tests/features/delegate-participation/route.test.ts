import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELEGATE_LIMITS } from "@/server/research/delegate-participation/limits";
import { participationRequest } from "./fixtures";

const mocks = vi.hoisted(() => ({ read: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/delegate-participation", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/delegate-participation")>(
    "@/server/research/delegate-participation",
  );
  return { ...actual, readDelegateParticipation: mocks.read };
});
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/delegate-participation/route";
import { DelegateParticipationError } from "@/server/research/delegate-participation/errors";

function request(body: unknown, options: { raw?: string; contentLength?: number } = {}) {
  const payload = options.raw ?? JSON.stringify(body);
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("content-length", String(options.contentLength ?? Buffer.byteLength(payload)));
  return new Request("http://localhost/api/insights/delegate-participation", { method: "POST", headers, body: payload }) as unknown as NextRequest;
}

const ready = { state: "ready", report: { state: "complete", delegates: [], proposals: [], coverage: [], readOnly: true } };

describe("delegate-participation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.read.mockResolvedValue(ready);
  });

  it("passes the request to the service and never caches the answer", async () => {
    const response = await POST(request(participationRequest("activeDelegates")));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ chain: "ethereum" }));
  });

  it("returns the rate limiter's own response before doing any work", async () => {
    mocks.rate.mockReturnValue(new Response(null, { status: 429 }));
    expect((await POST(request(participationRequest("activeDelegates")))).status).toBe(429);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON or is over the documented limit", async () => {
    const badJson = await POST(request(null, { raw: "{not json" }));
    expect(badJson.status).toBe(400);
    await expect(badJson.json()).resolves.toMatchObject({ error: "invalid_json" });

    const tooLarge = await POST(
      request(participationRequest("activeDelegates"), { contentLength: DELEGATE_LIMITS.maxRequestBytes + 1 }),
    );
    expect(tooLarge.status).toBe(413);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("answers an unsupported governor with 422, not with a provider error", async () => {
    mocks.read.mockResolvedValue({
      state: "unsupported_governor",
      report: ready.report,
      reason: "0x… holds no contract code on this chain, so it has no governor events to read.",
    });
    const response = await POST(request(participationRequest("unsupportedGovernor")));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ state: "unsupported_governor" });
  });

  it("answers an unreadable provider with 503", async () => {
    mocks.read.mockResolvedValue({ state: "unavailable", report: ready.report, reason: "provider down" });
    const response = await POST(request(participationRequest("providerUnavailable")));
    expect(response.status).toBe(503);
  });

  it("maps each typed feature error to 400 with its own code", async () => {
    for (const [code, message] of [
      ["invalid_request", "The delegate-participation request is invalid."],
      ["malformed_response", "eth_getLogs did not return a list."],
      ["provider_unavailable", "The ethereum provider answered 500."],
    ] as const) {
      mocks.read.mockRejectedValue(new DelegateParticipationError(code, message));
      const response = await POST(request(participationRequest("activeDelegates")));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: code, message });
    }
  });

  it("does not leak an unexpected failure to the client", async () => {
    mocks.read.mockRejectedValue(new Error("RPC key missing: SECRET"));
    const response = await POST(request(participationRequest("activeDelegates")));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "participation_read_failed",
      message: "The governance evidence could not be read.",
    });
  });
});
