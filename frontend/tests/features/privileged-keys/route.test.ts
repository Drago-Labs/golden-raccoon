import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/privileged-keys/route";
import { loadFixture } from "./fixtures";

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/insights/privileged-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/privileged-keys", () => {
  it("returns the multisig inventory for the recorded project", async () => {
    const response = await POST(post(loadFixture("multisig-project.json")));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.kind).toBe("ready");
    expect(body.report.controllers[0].threshold).toBe(2);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await POST(post("not-json"));
    expect(response.status).toBe(400);
  });
});
