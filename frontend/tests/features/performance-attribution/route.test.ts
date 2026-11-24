import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ATTRIBUTION_LIMITS } from "@/server/research/performance-attribution/limits";
import { attributionRequest, WALLET } from "./fixtures";

const mocks = vi.hoisted(() => ({ attribute: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/performance-attribution", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/performance-attribution")>(
    "@/server/research/performance-attribution",
  );
  return { ...actual, attributePerformance: mocks.attribute };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/performance-attribution/route";
import { AttributionError } from "@/server/research/performance-attribution/errors";

function request(body: unknown, options: { raw?: string; contentLength?: number } = {}) {
  const payload = options.raw ?? JSON.stringify(body);
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("content-length", String(options.contentLength ?? Buffer.byteLength(payload)));
  return new Request("http://localhost/api/insights/performance-attribution", { method: "POST", headers, body: payload }) as unknown as NextRequest;
}

const ready = { state: "ready", report: { state: "complete", periods: [], totals: {}, coverage: [], readOnly: true } };

describe("performance-attribution route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet: WALLET });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.attribute.mockResolvedValue(ready);
  });

  it("answers a valid request and never caches the answer", async () => {
    const response = await POST(request(attributionRequest("steadyPortfolio")));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual(ready);
  });

  it("attributes the session wallet's portfolio, not the one in the body", async () => {
    await POST(request(attributionRequest("steadyPortfolio", { walletAddress: "0x9999999999999999999999999999999999999999" })));
    expect(mocks.session).toHaveBeenCalledWith(expect.anything(), {
      suppliedWallet: "0x9999999999999999999999999999999999999999",
    });
    expect(mocks.attribute).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: WALLET }));
  });

  it("asks for the portfolio read capability on the requested network", async () => {
    await POST(request(attributionRequest("steadyPortfolio")));
    expect(mocks.authz).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "wallet", walletAddress: WALLET, chainFamily: "evm", network: "ethereum" }),
      "portfolio:read",
      { walletAddress: WALLET, network: "ethereum" },
    );
  });

  it("recognizes a Stellar network as the Stellar chain family", async () => {
    await POST(request(attributionRequest("steadyPortfolio", { network: "stellar-pubnet" })));
    expect(mocks.authz).toHaveBeenCalledWith(expect.objectContaining({ chainFamily: "stellar" }), "portfolio:read", expect.anything());
  });

  it("returns the rate limiter's and the session's own responses", async () => {
    mocks.rate.mockReturnValue(new Response(null, { status: 429 }));
    expect((await POST(request(attributionRequest("steadyPortfolio")))).status).toBe(429);
    expect(mocks.attribute).not.toHaveBeenCalled();

    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ response: new Response(null, { status: 403 }) });
    expect((await POST(request(attributionRequest("steadyPortfolio")))).status).toBe(403);
    expect(mocks.attribute).not.toHaveBeenCalled();
  });

  it("returns 403 when the capability is not granted", async () => {
    mocks.authz.mockReturnValue({ allowed: false, reason: "resource_owner_mismatch" });
    const response = await POST(request(attributionRequest("steadyPortfolio")));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "auth_error", reason: "resource_owner_mismatch" });
    expect(mocks.attribute).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON or is over the documented limit", async () => {
    const badJson = await POST(request(null, { raw: "{not json" }));
    expect(badJson.status).toBe(400);
    await expect(badJson.json()).resolves.toMatchObject({ error: "invalid_json" });

    const tooLarge = await POST(
      request(attributionRequest("steadyPortfolio"), { contentLength: ATTRIBUTION_LIMITS.maxRequestBytes + 1 }),
    );
    expect(tooLarge.status).toBe(413);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("reports an unattributable window as 503", async () => {
    mocks.attribute.mockResolvedValue({ state: "unavailable", report: ready.report, reason: "no observations" });
    const response = await POST(request(attributionRequest("providerUnavailable")));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ reason: "no observations" });
  });

  it("maps each typed feature error to 400 with its own code", async () => {
    for (const [code, message] of [
      ["invalid_request", "The attribution request is invalid."],
      ["identity_mismatch", "A recorded observation belongs to another wallet or network."],
      ["malformed_snapshot", "A recorded portfolio observation is malformed."],
    ] as const) {
      mocks.attribute.mockRejectedValue(new AttributionError(code, message));
      const response = await POST(request(attributionRequest("steadyPortfolio")));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: code, message });
    }
  });

  it("does not leak an unexpected failure to the client", async () => {
    mocks.attribute.mockRejectedValue(new Error("provider key missing: SECRET"));
    const response = await POST(request(attributionRequest("steadyPortfolio")));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "attribution_failed",
      message: "The recorded observations could not be attributed.",
    });
  });
});
