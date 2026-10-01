import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/governance-concentration/route";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/insights/governance-concentration", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("governance route", () => {
  it("rejects invalid json", async () => {
    const response = await POST(post("{"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
  });

  it("rejects a bad address", async () => {
    const response = await POST(post({ governor: "nope", fixture: { variant: "oz-governor", proposals: [], votePages: [] } }));
    expect(response.status).toBe(400);
  });
});
