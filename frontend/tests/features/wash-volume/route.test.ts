import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/wash-volume/route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/insights/wash-volume", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("wash volume route", () => {
  it("rejects invalid json and an empty pair", async () => {
    expect((await post("{")).status).toBe(400);
    const response = await post({ pair: "  ", trades: [] });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_pair" });
  });
});
