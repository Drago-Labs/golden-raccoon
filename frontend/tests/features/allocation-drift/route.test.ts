import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOCATION_LIMITS } from "@/server/research/allocation-drift/limits";
import { allocationRequest, balancedTarget, wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/allocation-drift", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/allocation-drift")>(
    "@/server/research/allocation-drift",
  );
  return { ...actual, inspectAllocationDrift: mocks.inspect };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/allocation-drift/route";
import { AllocationDriftError } from "@/server/research/allocation-drift/errors";

function request(body: unknown, raw?: string) {
  return new Request("http://localhost/api/insights/allocation-drift", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  }) as unknown as NextRequest;
}

const body = { ...allocationRequest(), targets: balancedTarget() };
const ready = { state: "ready", snapshot: null, report: null };

describe("allocation-drift route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.inspect.mockResolvedValue(ready);
  });

  it("answers a valid request and never caches the answer", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual(ready);
  });

  it("reads the portfolio of the session wallet, not the one in the body", async () => {
    mocks.session.mockReturnValue({ wallet });
    await POST(request({ ...body, walletAddress: "0x9999999999999999999999999999999999999999" }));
    expect(mocks.session).toHaveBeenCalledWith(expect.anything(), {
      suppliedWallet: "0x9999999999999999999999999999999999999999",
    });
    expect(mocks.inspect).toHaveBeenCalledWith(expect.objectContaining({ walletAddress: wallet }));
  });

  it("asks for the portfolio read capability on the requested network", async () => {
    await POST(request(body));
    expect(mocks.authz).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "wallet", walletAddress: wallet, chainFamily: "evm", network: "ethereum" }),
      "portfolio:read",
      { walletAddress: wallet, network: "ethereum" },
    );
  });

  it("recognizes a Stellar network as the Stellar chain family", async () => {
    await POST(request({ ...body, network: "stellar-pubnet" }));
    expect(mocks.authz).toHaveBeenCalledWith(
      expect.objectContaining({ chainFamily: "stellar" }),
      "portfolio:read",
      expect.anything(),
    );
  });

  it("returns the rate limiter's own response before reading the body", async () => {
    mocks.rate.mockReturnValue(new Response(null, { status: 429 }));
    const response = await POST(request(body));
    expect(response.status).toBe(429);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("returns the session's own response when there is no wallet session", async () => {
    mocks.session.mockReturnValue({ response: new Response(null, { status: 403 }) });
    const response = await POST(request(body));
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("returns 403 when the capability is not granted", async () => {
    mocks.authz.mockReturnValue({ allowed: false, reason: "resource_owner_mismatch" });
    const response = await POST(request(body));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "auth_error", reason: "resource_owner_mismatch" });
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const response = await POST(request(null, "{not json"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("rejects a body larger than the documented limit without buffering it", async () => {
    const response = await POST(request(null, JSON.stringify({ pad: "x".repeat(ALLOCATION_LIMITS.maxRequestBytes) })));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "payload_too_large" });
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("reports an unavailable provider as 503", async () => {
    mocks.inspect.mockResolvedValue({ state: "unavailable", snapshot: null, report: null, reason: "no provider" });
    const response = await POST(request(body));
    expect(response.status).toBe(503);
  });

  it("maps a typed feature error to 400 with its code", async () => {
    mocks.inspect.mockRejectedValue(new AllocationDriftError("invalid_request", "Target allocations must sum to exactly 100%."));
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request",
      message: "Target allocations must sum to exactly 100%.",
    });
  });

  it("does not leak an unexpected failure to the client", async () => {
    mocks.inspect.mockRejectedValue(new Error("provider key missing: SECRET"));
    const response = await POST(request(body));
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({ error: "analysis_failed", message: "Allocation evidence could not be read." });
  });
});
