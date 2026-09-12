import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/evidence-coverage/route";
import { EVIDENCE_LIMITS } from "@/server/research/evidence-coverage/schema";
import {
  comparableAndIncomparableConflicts,
  duplicateSourceFamilies,
  emptyReport,
  staleMissingSecretFields,
} from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/evidence-coverage", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/evidence-coverage", () => {
  it("returns a report for a readable request", async () => {
    const response = await POST(post(duplicateSourceFamilies));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.claims).toHaveLength(2);
  });

  it("does not count one family's repeats as corroboration through the route", async () => {
    const response = await POST(post(duplicateSourceFamilies));
    const payload = await response.json();
    const supply = payload.report.claims.find((claim: { claimId: string }) => claim.claimId === "claim-supply");

    expect(supply.independentFamilyCount).toBe(1);
    expect(supply.state).toBe("single_family");
  });

  it("never leaks a provider payload through the route", async () => {
    const response = await POST(post(staleMissingSecretFields));
    const body = await response.text();

    expect(body).not.toContain("should-never-appear");
    expect(body).not.toContain("sk-live");
    expect(body).not.toContain("harmlessField");
  });

  it("reports a provable conflict and declines the rest", async () => {
    const response = await POST(post(comparableAndIncomparableConflicts));
    const payload = await response.json();

    expect(payload.report.contradictions).toHaveLength(1);
    expect(payload.report.incomparablePairs).toHaveLength(3);
  });

  it("returns a successful, distinguishable empty result", async () => {
    const response = await POST(post(emptyReport));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.coverage.state).toBe("empty");
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects a family declared with no rationale", async () => {
    const response = await POST(
      post({ ...duplicateSourceFamilies, families: [{ familyId: "x", label: "X", memberLabels: ["Alpha Primary"] }] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(post(emptyReport, { "content-length": String(EVIDENCE_LIMITS.maxRequestBytes + 1) }));

    expect(response.status).toBe(413);
  });
});
