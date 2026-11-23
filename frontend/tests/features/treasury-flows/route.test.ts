import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/treasury-flows/route";
import { loadFixture } from "./fixtures";
describe("POST /api/insights/treasury-flows", () => {
  it("returns the reconstructed 80 USDC checkpoint", async () => {
    const response = await POST(new NextRequest("http://localhost/api/insights/treasury-flows", { method: "POST", body: JSON.stringify(loadFixture("active-treasury.json")) }));
    const body = await response.json();
    expect(body.report.balances[1].amount).toBe("80");
  });
  it("rejects a body that is not JSON", async () => {
    const response = await POST(new NextRequest("http://localhost/api/insights/treasury-flows", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
  });
});
