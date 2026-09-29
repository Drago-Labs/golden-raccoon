import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/execution-preflight/route";
import { PREFLIGHT_LIMITS } from "@/server/research/execution-preflight/schema";
import { planHashMismatch, stellarComplete, unavailableFee } from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/execution-preflight", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/execution-preflight", () => {
  it("returns a complete stellar budget", async () => {
    const response = await POST(post(stellarComplete));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.neverSignsOrSends).toBe(true);
    expect(payload.report.coverage.state).toBe("complete");
  });

  it("surfaces plan hash mismatch", async () => {
    const response = await POST(post(planHashMismatch));
    const payload = await response.json();
    expect(payload.report.coverage.safeToPresentAsComplete).toBe(false);
  });

  it("surfaces unavailable fees", async () => {
    const response = await POST(post(unavailableFee));
    const payload = await response.json();
    expect(payload.report.blockers.some((b: { code: string }) => b.code === "unavailable_fee")).toBe(true);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{bad"));
    expect(response.status).toBe(400);
  });

  it("rejects invalid requests", async () => {
    const response = await POST(post({ observedAt: "x", preparedPlan: {}, simulation: {} }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects oversized payloads", async () => {
    const response = await POST(post(stellarComplete, { "content-length": String(PREFLIGHT_LIMITS.maxRequestBytes + 1) }));
    expect(response.status).toBe(413);
  });
});
