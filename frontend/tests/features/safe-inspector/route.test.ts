import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/safe-inspector/route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/insights/safe-inspector", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("safe inspector route", () => {
  it("rejects invalid json and a bad address", async () => {
    expect((await post("{")).status).toBe(400);
    const response = await post({ address: "safe" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_address" });
  });
});
