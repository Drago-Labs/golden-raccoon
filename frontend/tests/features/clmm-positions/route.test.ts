import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: () => null }));

import { POST } from "@/app/api/insights/clmm-positions/route";
import { ADDRESS } from "./fixtures";

describe("clmm positions route", () => {
  it("rejects invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/clmm-positions", {
        method: "POST",
        body: "not-json",
      }) as never,
    );
    expect(response.status).toBe(400);
  });

  it("rejects oversized payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/clmm-positions", {
        method: "POST",
        headers: { "content-length": "999999" },
        body: "{}",
      }) as never,
    );
    expect(response.status).toBe(413);
  });

  it("returns a no-store report for a valid address", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/clmm-positions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: ADDRESS, network: "ethereum" }),
      }) as never,
    );
    expect([200, 503]).toContain(response.status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.report).toBeDefined();
    expect(body.report.readOnly).toBe(true);
  });

  it("rejects invalid addresses", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/clmm-positions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: "bad", network: "ethereum" }),
      }) as never,
    );
    expect(response.status).toBe(400);
  });
});
