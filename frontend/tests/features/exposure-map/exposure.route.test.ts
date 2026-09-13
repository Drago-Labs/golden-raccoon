import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/exposure-map/route";
import { EXPOSURE_LIMITS, toMicroUsd } from "@/server/research/exposure-map/schema";
import { emptyPortfolio, partialPricesUnresolved, sharedIssuerMixedChain } from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/exposure-map", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/exposure-map", () => {
  it("returns a map for a readable request", async () => {
    const response = await POST(post(sharedIssuerMixedChain));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.map.groups.length).toBeGreaterThan(0);
  });

  it("returns exact grouped totals", async () => {
    const response = await POST(post(sharedIssuerMixedChain));
    const payload = await response.json();
    const group = payload.map.groups.find((entry: { nodeId: string }) => entry.nodeId === "issuer:stellar-pubnet:centre consortium");

    expect(group.totalMicroUsd).toBe(toMicroUsd(1_500));
  });

  it("returns a successful, distinguishable empty result", async () => {
    const response = await POST(post(emptyPortfolio));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.map.coverage.state).toBe("empty");
  });

  it("returns a partial result rather than failing on unpriced holdings", async () => {
    const response = await POST(post(partialPricesUnresolved));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.map.coverage.state).toBe("partial");
    expect(payload.map.unresolved.length).toBeGreaterThan(0);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects a relationship with no provenance", async () => {
    const response = await POST(
      post({ ...sharedIssuerMixedChain, relationships: [{ fromAssetKey: "USDC", kind: "issuer", targetLabel: "X" }] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(
      post(sharedIssuerMixedChain, { "content-length": String(EXPOSURE_LIMITS.maxRequestBytes + 1) }),
    );

    expect(response.status).toBe(413);
  });

  it("reports unmatched declarations rather than silently dropping them", async () => {
    const response = await POST(
      post({
        ...sharedIssuerMixedChain,
        relationships: [
          ...sharedIssuerMixedChain.relationships,
          { fromAssetKey: "NOTHELD", kind: "issuer", targetLabel: "Ghost", provenance: "operator_declared" },
        ],
      }),
    );
    const payload = await response.json();

    expect(payload.unmatchedDeclarations).toHaveLength(1);
    expect(payload.unmatchedDeclarations[0].fromAssetKey).toBe("NOTHELD");
  });
});
