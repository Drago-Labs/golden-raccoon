import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/peg-observations/route";
import { PEG_LIMITS } from "@/server/research/peg-observations/schema";
import { emptyRequest, missingRatesIdentityCollision, usdAndNonUsdTargets } from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/peg-observations", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/peg-observations", () => {
  it("returns a report for a readable request", async () => {
    const response = await POST(post(usdAndNonUsdTargets));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.assets).toHaveLength(2);
  });

  it("uses the declared non-USD target through the route", async () => {
    const response = await POST(post(usdAndNonUsdTargets));
    const payload = await response.json();
    const eurc = payload.report.assets.find(
      (asset: { definition: { asset: { symbol: string } } }) => asset.definition.asset.symbol === "EURC",
    );

    expect(eurc.definition.referenceCurrency).toBe("EUR");
    expect(eurc.observations[1].deviationBps).toBe(-100);
  });

  it("lists an undeclared asset rather than assuming a dollar target", async () => {
    const response = await POST(post(missingRatesIdentityCollision));
    const payload = await response.json();

    expect(payload.report.undefinedAssets).toHaveLength(1);
    expect(payload.report.assets).toHaveLength(1);
  });

  it("returns a successful, distinguishable empty result", async () => {
    const response = await POST(post(emptyRequest));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.coverage.state).toBe("empty");
  });

  it("rejects a window that does not move forward", async () => {
    const response = await POST(
      post({ ...emptyRequest, windowStart: "2026-01-02T00:00:00.000Z", windowEnd: "2026-01-01T00:00:00.000Z" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_window" });
  });

  it("rejects a definition with no provenance", async () => {
    const response = await POST(
      post({
        ...usdAndNonUsdTargets,
        definitions: [{ asset: { chainId: "ethereum", symbol: "X" }, referenceCurrency: "USD", targetValue: "1.00" }],
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(post(emptyRequest, { "content-length": String(PEG_LIMITS.maxRequestBytes + 1) }));

    expect(response.status).toBe(413);
  });
});
