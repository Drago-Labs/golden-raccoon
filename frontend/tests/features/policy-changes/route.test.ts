import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { ORIGINAL_PAGE_HTML, request } from "./fixtures";

const fetchState = vi.hoisted(() => ({
  outcome: "ok" as string,
  body: null as string | null,
}));

vi.mock("@/server/research/policy-changes/fetcher", () => ({
  createProductionPageFetcher: () => async () => ({
    outcome: fetchState.outcome,
    requestedUrl: "https://stellar.org/terms-of-service",
    finalUrl: "https://stellar.org/terms-of-service",
    httpStatus: fetchState.outcome === "ok" ? 200 : 503,
    redirectChain: [],
    contentType: "text/html",
    byteLength: fetchState.body?.length ?? 0,
    body: fetchState.body,
    issues: [],
  }),
  probePolicyUrlSafety: (url: string) => ({ allowed: url.startsWith("https://"), issues: [] }),
}));

const { POST } = await import("@/app/api/insights/policy-changes/route");

function post(body: unknown): NextRequest {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://localhost/api/insights/policy-changes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

describe("POST /api/insights/policy-changes", () => {
  it("returns a report for a known project", async () => {
    fetchState.outcome = "ok";
    fetchState.body = ORIGINAL_PAGE_HTML;

    const response = await POST(post(request()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.projectId).toBe("sdf-terms");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 400 for an unknown project", async () => {
    fetchState.outcome = "ok";
    fetchState.body = ORIGINAL_PAGE_HTML;

    const response = await POST(post(request({ projectId: "unknown" })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("unknown_project");
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(post("not json"));
    expect(response.status).toBe(400);
  });

  it("returns 413 for an oversized payload", async () => {
    const response = await POST(post(request({ priorSnapshots: [], padding: "x".repeat(300_000) })));
    expect(response.status).toBe(413);
  });
});
