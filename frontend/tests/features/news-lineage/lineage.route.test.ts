import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/news-lineage/route";
import { LINEAGE_LIMITS } from "@/server/research/news-lineage/schema";
import { emptyEvidence, multilingualSparseAdversarial, syndicatedAndIndependentReports } from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/news-lineage", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/news-lineage", () => {
  it("returns a report for a readable request", async () => {
    const response = await POST(post(syndicatedAndIndependentReports));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.clusters).toHaveLength(2);
  });

  it("does not count syndicated copies as corroboration through the route", async () => {
    const response = await POST(post(syndicatedAndIndependentReports));
    const payload = await response.json();
    const syndication = payload.report.corroboration.find(
      (entry: { state: string }) => entry.state === "syndication_only",
    );

    expect(syndication.independentReportCount).toBe(1);
  });

  it("declares that no score was changed", async () => {
    const response = await POST(post(syndicatedAndIndependentReports));
    const payload = await response.json();

    expect(payload.report.scoreUnchanged).toBe(true);
  });

  it("never returns markup from a provider title", async () => {
    const response = await POST(post(multilingualSparseAdversarial));
    const body = await response.text();

    expect(body).not.toContain("<script>");
    expect(body).not.toContain("<b>");
  });

  it("returns a successful, distinguishable empty result", async () => {
    const response = await POST(post(emptyEvidence));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.coverage.state).toBe("empty");
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects an unreadable observation time", async () => {
    const response = await POST(post({ observedAt: "not-a-date", articles: [] }));

    expect(response.status).toBe(400);
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(post(emptyEvidence, { "content-length": String(LINEAGE_LIMITS.maxRequestBytes + 1) }));

    expect(response.status).toBe(413);
  });
});
