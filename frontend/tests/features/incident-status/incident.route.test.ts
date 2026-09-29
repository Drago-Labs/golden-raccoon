import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/incident-status/route";
import { INCIDENT_LIMITS } from "@/server/research/incident-status/schema";
import {
  conflictingOfficialSources,
  emptyIncident,
  rumorCannotAcknowledge,
  sameNameDifferentChain,
  statusRevisionOfficial,
} from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/incident-status", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/incident-status", () => {
  it("returns a report for a readable request", async () => {
    const response = await POST(post(statusRevisionOfficial));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.documents.length).toBe(3);
    expect(payload.report.scoreUnchanged).toBe(true);
  });

  it("keeps rumours from becoming acknowledgements through the route", async () => {
    const response = await POST(post(rumorCannotAcknowledge));
    const payload = await response.json();
    const rumor = payload.report.documents.find((document: { documentId: string }) => document.documentId === "rumor-1");

    expect(rumor.effectiveStatus).toBe("reported");
  });

  it("reports conflicting official sources", async () => {
    const response = await POST(post(conflictingOfficialSources));
    const payload = await response.json();

    expect(payload.report.coverage.state).toBe("disputed");
    expect(payload.report.disagreements.length).toBeGreaterThan(0);
  });

  it("returns a successful empty result", async () => {
    const response = await POST(post(emptyIncident));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.coverage.state).toBe("empty");
  });

  it("rejects a subject mismatch across networks", async () => {
    const response = await POST(post(sameNameDifferentChain));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "subject_mismatch" });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects an invalid request body", async () => {
    const response = await POST(post({ observedAt: "not-a-date", subject: {}, documents: [] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(post(statusRevisionOfficial, { "content-length": String(INCIDENT_LIMITS.maxRequestBytes + 1) }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "payload_too_large" });
  });
});
