import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/invocation-profile/route";
import { NextRequest } from "next/server";
import { baseRequest } from "./fixtures";

describe("route", () => {
  it("rejects invalid JSON", async () => {
    const request = new NextRequest("http://localhost/api/insights/invocation-profile", {
      method: "POST",
      body: "invalid json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects payload too large", async () => {
    const request = new NextRequest("http://localhost/api/insights/invocation-profile", {
      method: "POST",
      headers: { "content-length": "999999" },
      body: "{}",
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
  });

  it("processes a valid request", async () => {
    const request = new NextRequest("http://localhost/api/insights/invocation-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(baseRequest),
    });
    const response = await POST(request);
    expect([200, 503]).toContain(response.status);
    const body = await response.json();
    expect(body.report).toBeDefined();
    expect(body.report.schemaVersion).toBe(1);
  });

  it("rejects an invalid contract id", async () => {
    const request = new NextRequest("http://localhost/api/insights/invocation-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...baseRequest, contractId: "GABC" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
