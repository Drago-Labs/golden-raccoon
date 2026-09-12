import { describe, it, expect, vi } from "vitest";
import { GET, POST } from "@/app/api/insights/exposure-map/route";
import { NextRequest } from "next/server";
import {
  SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
  NESTED_CYCLE_HOLDINGS,
  NESTED_CYCLE_CUSTOM_RELATIONSHIPS,
} from "./fixtures";

vi.mock("@/server/portfolio/getPortfolio", () => ({
  getPortfolioSnapshot: vi.fn(async (walletAddress?: string) => ({
    portfolio: {
      walletAddress: walletAddress || "0x123",
      totalValueUsd: 16000,
      holdings: SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
    },
  })),
}));

describe("Exposure Map API Route: GET /api/insights/exposure-map", () => {
  it("returns 200 with complete exposure map and security headers", async () => {
    const req = new NextRequest("http://localhost:3000/api/insights/exposure-map?walletAddress=0x123&chain=ethereum", {
      headers: {
        "x-forwarded-for": "127.0.0.1",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const cacheControl = res.headers.get("Cache-Control");
    const nosniff = res.headers.get("X-Content-Type-Options");
    expect(cacheControl).toBe("no-store, no-cache, must-revalidate");
    expect(nosniff).toBe("nosniff");

    const json = await res.json();
    expect(json.walletAddress).toBe("0x123");
    expect(json.groupedExposures.byIssuer.length).toBeGreaterThan(0);
    expect(json.concentration).toBeDefined();
    expect(json.coverage).toBeDefined();
  });
});

describe("Exposure Map API Route: POST /api/insights/exposure-map", () => {
  it("processes custom holdings and declarations via POST", async () => {
    const payload = {
      walletAddress: "0x789",
      chain: "ethereum",
      holdings: NESTED_CYCLE_HOLDINGS,
      customRelationships: NESTED_CYCLE_CUSTOM_RELATIONSHIPS,
    };

    const req = new NextRequest("http://localhost:3000/api/insights/exposure-map", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.2",
      },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.walletAddress).toBe("0x789");
    expect(json.cycles.length).toBeGreaterThan(0);
    expect(json.coverage.totalPortfolioValueUsd).toBe(2000);
  });

  it("returns 400 for invalid body payload", async () => {
    const req = new NextRequest("http://localhost:3000/api/insights/exposure-map", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "127.0.0.3",
      },
      body: JSON.stringify({
        customRelationships: "not-an-array",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid request payload");
  });

  it("enforces rate limits for abusive IP traffic", async () => {
    const ip = "192.168.1.100";
    let lastStatus = 200;

    for (let i = 0; i < 42; i++) {
      const req = new NextRequest("http://localhost:3000/api/insights/exposure-map", {
        headers: {
          "x-forwarded-for": ip,
        },
      });
      const res = await GET(req);
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
