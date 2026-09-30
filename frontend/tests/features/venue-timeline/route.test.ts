import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/venue-timeline/route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/insights/venue-timeline", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("venue timeline route", () => {
  it("rejects invalid json and a ticker without a contract", async () => {
    expect((await post("{")).status).toBe(400);
    const response = await post({ chainId: 1, contract: "AAA", snapshots: [] });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_contract" });
  });
});
