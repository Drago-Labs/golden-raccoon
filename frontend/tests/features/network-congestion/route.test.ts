import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONGESTION_LIMITS } from "@/server/research/network-congestion/limits";
import { createRecordedReader, createUnavailableReader, providerUnavailable, quietWindow } from "./fixtures";

const state = vi.hoisted(() => ({ mode: "quiet" as "quiet" | "down" | "boom" }));
const rate = vi.hoisted(() => vi.fn(() => null as Response | null));

vi.mock("@/server/security/rateLimit", () => ({
  checkRateLimit: rate,
}));

vi.mock("@/server/research/network-congestion/ledgerReader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/network-congestion/ledgerReader")>();

  return {
    ...actual,
    createHorizonLedgerReader: () => {
      if (state.mode === "down") return createUnavailableReader(providerUnavailable.error.message);
      if (state.mode === "boom") {
        return {
          async readLatest() {
            throw new Error("socket");
          },
          async readHeader() {
            throw new Error("socket");
          },
          async readRange() {
            throw new Error("socket");
          },
        };
      }

      return createRecordedReader(quietWindow);
    },
  };
});

const { POST } = await import("@/app/api/insights/network-congestion/route");

function post(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/insights/network-congestion", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  state.mode = "quiet";
  rate.mockReset();
  rate.mockReturnValue(null);
});

describe("POST /api/insights/network-congestion", () => {
  it("returns the quiet report and does not call the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(post(quietWindow.request));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.fees.classicInclusion.p50).toBe("100");
    expect(payload.report.fees.sorobanResource.p50).toBe("5000");
    expect(payload.report.readOnly).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ namespace: "network-congestion" }));
    fetchSpy.mockRestore();
  });

  it("rejects an unreadable body, an inverted window, and two windows at once", async () => {
    const invalid = await POST(post("{"));
    const inverted = await POST(post({ network: "stellar-pubnet", fromSequence: 12, toSequence: 10 }));
    const both = await POST(post({ ...quietWindow.request, atLedger: 100 }));

    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "invalid_json" });
    expect(inverted.status).toBe(400);
    expect(await inverted.json()).toMatchObject({ error: "window_inverted" });
    expect(both.status).toBe(400);
    expect(await both.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects an oversized body before explaining it", async () => {
    const response = await POST(post(quietWindow.request, { "content-length": String(CONGESTION_LIMITS.maxRequestBytes + 1) }));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "payload_too_large" });
  });

  it("returns the rate-limit response unchanged", async () => {
    rate.mockReturnValue(NextResponse.json({ error: "rate_limited" }, { status: 429 }));

    const response = await POST(post(quietWindow.request));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
  });

  it("returns 503 when the provider is unavailable and 500 for an unexpected failure", async () => {
    state.mode = "down";
    const unavailable = await POST(post(providerUnavailable.request));

    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({
      error: providerUnavailable.error.code,
      message: providerUnavailable.error.message,
    });

    state.mode = "boom";
    const failed = await POST(post(quietWindow.request));

    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "network_congestion_failed" });
  });
});
