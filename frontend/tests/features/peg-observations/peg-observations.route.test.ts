import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/insights/peg-observations/route";
import { USDC_ETH_ID } from "./fixtures";

vi.mock("@/server/security/auth", () => ({
  getServerWalletAddress: vi.fn(),
}));

vi.mock("@/server/security/walletSession", () => ({
  readWalletSessionCookie: vi.fn().mockReturnValue(null),
}));

vi.mock("@/server/security/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue(null),
}));

describe("Peg Observations API Route Handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles GET requests with valid query parameters and returns no-store cache headers", async () => {
    const url = new URL("http://localhost:3000/api/insights/peg-observations");
    url.searchParams.set("chainFamily", USDC_ETH_ID.chainFamily);
    url.searchParams.set("network", USDC_ETH_ID.network);
    url.searchParams.set("symbol", USDC_ETH_ID.symbol);
    url.searchParams.set("addressOrIssuer", USDC_ETH_ID.addressOrIssuer);
    url.searchParams.set("thresholdBps", "50");
    url.searchParams.set("fixture", "usd-and-nonusd-targets");

    const req = new NextRequest(url.toString(), { method: "GET" });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const data = await res.json();
    expect(data.pegDefinition).toBeDefined();
    expect(data.coverage).toBeDefined();
    expect(data.summary).toBeDefined();
  });

  it("returns 400 Bad Request on invalid query parameters", async () => {
    const url = new URL("http://localhost:3000/api/insights/peg-observations");
    url.searchParams.set("chainFamily", "unsupported-family");
    url.searchParams.set("symbol", "");

    const req = new NextRequest(url.toString(), { method: "GET" });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_query_parameters");
    expect(data.details).toBeDefined();
  });

  it("handles POST requests with valid custom payload", async () => {
    const payload = {
      assetId: USDC_ETH_ID,
      thresholdBps: 25,
      gapToleranceMs: 3_600_000,
      fixture: "deviation-recovery-with-gaps",
    };

    const req = new NextRequest("http://localhost:3000/api/insights/peg-observations", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");

    const data = await res.json();
    expect(data.pegDefinition.assetId.symbol).toBe("USDC");
    expect(data.coverage.gapsDetected.length).toBeGreaterThan(0);
  });

  it("returns 400 Bad Request on malformed JSON payload in POST", async () => {
    const req = new NextRequest("http://localhost:3000/api/insights/peg-observations", {
      method: "POST",
      body: "not-json{",
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_json_body");
  });

  it("returns 429 Too Many Requests when rate limit is exceeded", async () => {
    const { checkRateLimit } = await import("@/server/security/rateLimit");
    vi.mocked(checkRateLimit).mockReturnValueOnce(
      NextResponse.json({ error: "rate_limited" }, { status: 429 }),
    );

    const url = new URL("http://localhost:3000/api/insights/peg-observations");
    url.searchParams.set("chainFamily", USDC_ETH_ID.chainFamily);
    url.searchParams.set("network", USDC_ETH_ID.network);
    url.searchParams.set("symbol", USDC_ETH_ID.symbol);
    url.searchParams.set("addressOrIssuer", USDC_ETH_ID.addressOrIssuer);

    const req = new NextRequest(url.toString(), { method: "GET" });
    const res = await GET(req);

    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("rate_limited");
  });
});
