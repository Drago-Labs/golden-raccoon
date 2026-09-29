import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/spam-dust-review/route";
import { SPAM_DUST_LIMITS } from "@/server/research/spam-dust-review/schema";
import { emptyWallet, highValueUnpriced, preferenceRoundTrip, providerFailure, spamLikeFixtures } from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/spam-dust-review", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/spam-dust-review", () => {
  it("returns a review report", async () => {
    const response = await POST(post(spamLikeFixtures));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.portfolioUnchanged).toBe(true);
  });

  it("does not promote high-value unpriced holdings to dust via the route", async () => {
    const response = await POST(post(highValueUnpriced));
    const payload = await response.json();
    const kinds = payload.report.holdings[0].signals.map((signal: { kind: string }) => signal.kind);

    expect(kinds).toEqual(["unpriced"]);
  });

  it("round-trips preferences privately without caching", async () => {
    const response = await POST(post(preferenceRoundTrip));
    const payload = await response.json();

    expect(payload.report.holdings[0].hidden).toBe(true);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("reports provider failure coverage", async () => {
    const response = await POST(post(providerFailure));
    const payload = await response.json();
    expect(payload.report.coverage.state).toBe("provider_failed");
  });

  it("returns empty coverage", async () => {
    const response = await POST(post(emptyWallet));
    const payload = await response.json();
    expect(payload.report.coverage.state).toBe("empty");
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{nope"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects invalid requests", async () => {
    const response = await POST(post({ walletId: "", chainId: "x", generatedAt: "no", holdings: [] }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects oversized payloads", async () => {
    const response = await POST(post(spamLikeFixtures, { "content-length": String(SPAM_DUST_LIMITS.maxRequestBytes + 1) }));
    expect(response.status).toBe(413);
  });
});
