import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/bridge-latency/route";
import { loadFixture } from "./fixtures";
describe("POST /api/insights/bridge-latency", () => {
  it("returns the healthy route median", async () => {
    const response = await POST(new NextRequest("http://localhost/api/insights/bridge-latency", { method: "POST", body: JSON.stringify(loadFixture("healthy-bridge.json")) }));
    const body = await response.json();
    expect(body.report.routes[0].p50).toBe(30);
  });
  it("rejects a body that is not JSON", async () => {
    const response = await POST(new NextRequest("http://localhost/api/insights/bridge-latency", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
  });
});
