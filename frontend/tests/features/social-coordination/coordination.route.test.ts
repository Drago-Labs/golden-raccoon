import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/social-coordination/route";
import { COORDINATION_LIMITS } from "@/server/research/social-coordination/schema";
import { duplicatesMalformedHostile, emptySample, sparseSample, synchronizedCopyBurst } from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/social-coordination", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/social-coordination", () => {
  it("returns a report for a readable request", async () => {
    const response = await POST(post(synchronizedCopyBurst));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.clusters.length).toBeGreaterThan(0);
  });

  it("returns insufficient evidence for a small sample", async () => {
    const response = await POST(post(sparseSample));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.coverage.state).toBe("insufficient");
    expect(payload.report.findings[0].strength).toBe("insufficient_evidence");
  });

  it("publishes the thresholds in the payload", async () => {
    const response = await POST(post(synchronizedCopyBurst));
    const payload = await response.json();

    expect(payload.report.thresholds.repeatSimilarity).toBe(0.9);
    expect(payload.report.thresholds.minObservationsForAnalysis).toBe(12);
  });

  it("declares that no score changed", async () => {
    const response = await POST(post(synchronizedCopyBurst));
    const payload = await response.json();

    expect(payload.report.scoreUnchanged).toBe(true);
  });

  it("never returns markup from observation text", async () => {
    const response = await POST(post(duplicatesMalformedHostile));
    const body = await response.text();

    expect(body).not.toContain("<script>");
  });

  it("returns a successful, distinguishable empty result", async () => {
    const response = await POST(post(emptySample));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.coverage.state).toBe("empty");
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(post(emptySample, { "content-length": String(COORDINATION_LIMITS.maxRequestBytes + 1) }));

    expect(response.status).toBe(413);
  });
});
