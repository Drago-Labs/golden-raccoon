import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/audit-coverage/route";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/insights/audit-coverage", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("audit route", () => {
  it("rejects invalid json and a bad address", async () => {
    expect((await POST(post("{"))).status).toBe(400);
    expect((await POST(post({ contract: "nope" }))).status).toBe(400);
  });
});
