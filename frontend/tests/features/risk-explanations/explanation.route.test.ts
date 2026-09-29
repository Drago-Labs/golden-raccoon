import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/risk-explanations/route";
import { EXPLANATION_LIMITS } from "@/server/research/risk-explanations/schema";
import { completeAndUnlinkedReport, emptyReport } from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/risk-explanations", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/risk-explanations", () => {
  it("returns an explanation for a readable report", async () => {
    const response = await POST(post({ reportVersion: "risk-report/v1", report: completeAndUnlinkedReport }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.explanation.subject.reportId).toBe(completeAndUnlinkedReport.id);
    expect(payload.explanation.contributions.length).toBeGreaterThan(0);
  });

  it("returns a successful, distinguishable empty result", async () => {
    const response = await POST(post({ reportVersion: "risk-report/v1", report: emptyReport }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.explanation.coverage.state).toBe("empty");
  });

  it("rejects an unsupported report version", async () => {
    const response = await POST(post({ reportVersion: "risk-report/v9", report: completeAndUnlinkedReport }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(
      post(
        { reportVersion: "risk-report/v1", report: completeAndUnlinkedReport },
        { "content-length": String(EXPLANATION_LIMITS.maxRequestBytes + 1) },
      ),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "payload_too_large" });
  });

  it("rejects a report that does not match the readable shape", async () => {
    const response = await POST(post({ reportVersion: "risk-report/v1", report: { id: "broken" } }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("returns a derived document rather than echoing the submitted report", async () => {
    const response = await POST(post({ reportVersion: "risk-report/v1", report: completeAndUnlinkedReport }));
    const payload = await response.json();

    expect(payload.report).toBeUndefined();
    expect(payload.explanation.agentCards).toBeUndefined();
    expect(payload.explanation.topReasons).toBeUndefined();
    // Canonical identity is derived on purpose; it is public chain data and is
    // what lets two same-symbol assets stay distinct in the UI.
    expect(payload.explanation.subject.asset.identityKey).toContain("ethereum");
  });
});
