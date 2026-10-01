import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/repo-continuity/route";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/insights/repo-continuity", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("repo continuity route", () => {
  it("rejects invalid json", async () => {
    expect((await POST(post("{"))).status).toBe(400);
  });

  it("rejects a bad repository name", async () => {
    expect((await POST(post({ repo: "nope" }))).status).toBe(400);
  });
});
