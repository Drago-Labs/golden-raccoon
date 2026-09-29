import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ops/provider-schema-drift/route";
import { secretRedaction, unitShiftedStellar, unchangedReplay } from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/ops/provider-schema-drift", {
    method: "POST",
    headers: { "content-type": "application/json", "x-operator-test": "1", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  delete process.env.PROVIDER_DRIFT_OPERATOR_TOKEN;
});

describe("POST /api/ops/provider-schema-drift", () => {
  it("rejects unauthorized callers", async () => {
    process.env.PROVIDER_DRIFT_OPERATOR_TOKEN = "expected-token";
    const response = await POST(post(unchangedReplay, { "x-operator-test": "", "x-operator-token": "wrong" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "operator_unauthorized" });
  });

  it("accepts an operator token", async () => {
    process.env.PROVIDER_DRIFT_OPERATOR_TOKEN = "expected-token";
    const response = await POST(post(unitShiftedStellar, { "x-operator-token": "expected-token", "x-operator-test": "" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.report.summary.breaking).toBeGreaterThan(0);
  });

  it("never leaks secrets through the route body", async () => {
    const response = await POST(post(secretRedaction));
    const body = await response.text();
    expect(body).not.toContain("sk-live-should-never-appear");
    expect(body).not.toContain("secret-material");
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{bad"));
    expect(response.status).toBe(400);
  });

  it("rejects invalid requests", async () => {
    const response = await POST(post({ observedAt: "x", probes: [] }));
    expect(response.status).toBe(400);
  });
});
