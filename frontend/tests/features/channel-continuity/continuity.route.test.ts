import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/channel-continuity/route";
import { CONTINUITY_LIMITS } from "@/server/research/channel-continuity/schema";
import {
  emptySample,
  hostileMarkup,
  missingArchiveAndSourceFailure,
  redirectAndDomainChurn,
  unsafePrivateRedirect,
} from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/channel-continuity", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/channel-continuity", () => {
  it("returns a report for a readable request", async () => {
    const response = await POST(post(redirectAndDomainChurn));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.events.length).toBeGreaterThan(0);
    expect(payload.report.scoreUnchanged).toBe(true);
  });

  it("surfaces missing archives and source failures in coverage", async () => {
    const response = await POST(post(missingArchiveAndSourceFailure));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.events.some((event: { kind: string }) => event.kind === "missing_archive")).toBe(true);
    expect(payload.report.events.some((event: { kind: string }) => event.kind === "source_failure")).toBe(true);
  });

  it("blocks unsafe private redirects in the typed payload", async () => {
    const response = await POST(post(unsafePrivateRedirect));
    const payload = await response.json();

    expect(response.status).toBe(200);
    const blocked = payload.report.observations.find(
      (observation: { observationId: string }) => observation.observationId === "alpha-ssrf",
    );
    expect(blocked.fetchOutcome).toBe("blocked_unsafe");
  });

  it("never returns markup from observation text", async () => {
    const response = await POST(post(hostileMarkup));
    const body = await response.text();

    expect(body).not.toContain("<script>");
  });

  it("returns a successful empty result", async () => {
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
    const response = await POST(post(emptySample, { "content-length": String(CONTINUITY_LIMITS.maxRequestBytes + 1) }));

    expect(response.status).toBe(413);
  });

  it("rejects an unreadable observation time", async () => {
    const response = await POST(post({ ...emptySample, observedAt: "not-a-date" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.report).toBeUndefined();
    expect(payload.error).toMatch(/invalid/);
  });
});
