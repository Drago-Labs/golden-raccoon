import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/account-lineage/route";

const ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/insights/account-lineage", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("lineage route", () => {
  it("rejects invalid json and a bad account", async () => {
    expect((await POST(post("{"))).status).toBe(400);
    expect((await POST(post({ account: "nope" }))).status).toBe(400);
  });

  it("accepts a stellar account with a fixture", async () => {
    const response = await POST(post({ account: ACCOUNT, fixture: { account: ACCOUNT, hopLimit: 1, accounts: [{ id: ACCOUNT, missing: true }] } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.hops[0].status).toBe("missing");
  });
});
