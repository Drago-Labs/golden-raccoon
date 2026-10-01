import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/source-bytecode/route";

const ADDRESS = "0x1111111111111111111111111111111111111111";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/insights/source-bytecode", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("source bytecode route", () => {
  it("rejects invalid json", async () => {
    const response = await post("{");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_json" });
  });

  it("rejects a bad address", async () => {
    const response = await post({ address: "nope", blockNumber: 1, source: null });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_address" });
  });

  it("returns unavailable rather than unverified when the source failed", async () => {
    const response = await post({ address: ADDRESS, blockNumber: 1, sourceFailed: true });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.report.status).toBe("unavailable");
  });
});
