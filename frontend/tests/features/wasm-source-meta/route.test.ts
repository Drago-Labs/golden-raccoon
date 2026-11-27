import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/insights/wasm-source-meta/route";
import { MATCHING_CONTRACT } from "./fixtures";

describe("route", () => {
  it("rejects invalid JSON", async () => {
    const request = new NextRequest("http://localhost/api/insights/wasm-source-meta", {
      method: "POST",
      body: "invalid json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("rejects payload too large", async () => {
    const request = new NextRequest("http://localhost/api/insights/wasm-source-meta", {
      method: "POST",
      headers: { "content-length": "999999" },
      body: "{}",
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
  });

  it("rejects invalid contract IDs", async () => {
    const body = JSON.stringify({
      contractId: "bad",
      network: "stellar-testnet",
    });
    const request = new NextRequest("http://localhost/api/insights/wasm-source-meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("accepts a well-formed request body shape", async () => {
    const body = JSON.stringify({
      contractId: MATCHING_CONTRACT,
      network: "stellar-testnet",
      declaredSources: [
        {
          field: "repository",
          value: "https://github.com/example/matching-contract",
          source: "README",
        },
      ],
    });
    const request = new NextRequest("http://localhost/api/insights/wasm-source-meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const response = await POST(request);
    // Live RPC may be unavailable in CI; accept success or provider failure.
    expect([200, 404, 503]).toContain(response.status);
  });
});
