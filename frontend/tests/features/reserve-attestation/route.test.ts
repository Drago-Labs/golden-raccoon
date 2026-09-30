import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { baseRequest } from "./fixtures";

const mocks = vi.hoisted(() => ({ rate: vi.fn() }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/reserve-attestation/route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/insights/reserve-attestation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("reserve attestation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
  });

  it("returns a report for a well-formed request", async () => {
    const response = await POST(request(baseRequest()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.assets).toHaveLength(1);
  });

  it("rejects malformed JSON before touching the analysis", async () => {
    const response = await POST(request("{not json"));
    expect(response.status).toBe(400);
  });

  it("maps a schema violation to a 400 with the error code", async () => {
    const response = await POST(request(baseRequest({ registry: [] })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_request");
  });

  it("returns the rate-limit response before running any analysis", async () => {
    mocks.rate.mockReturnValue(new Response(null, { status: 429 }));
    const response = await POST(request(baseRequest()));
    expect(response.status).toBe(429);
  });
});
