import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/frontend-integrity/route";
import { loadFixture } from "./fixtures";
describe("POST /api/insights/frontend-integrity", () => {
  it("returns the stable snapshot", async () => {
    const response = await POST(new NextRequest("http://localhost/api/insights/frontend-integrity", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(loadFixture("stable-site.json")),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).kind).toBe("ready");
  });
  it("rejects a body that is not JSON", async () => {
    const response = await POST(new NextRequest("http://localhost/api/insights/frontend-integrity", { method: "POST", body: "not-json" }));
    expect(response.status).toBe(400);
  });
});
