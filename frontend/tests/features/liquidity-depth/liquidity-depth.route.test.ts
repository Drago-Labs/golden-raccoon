import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/insights/liquidity-depth/route";
import { validOrderbookFixture } from "./fixtures";
import * as rateLimitModule from "@/server/security/rateLimit";
import * as serviceModule from "@/server/research/liquidity-depth/service";

describe("Liquidity Depth API Route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/insights/liquidity-depth", () => {
    it("returns 200 with result and security headers for valid query params", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockReturnValue(null);
      vi.spyOn(serviceModule, "getLiquidityDepth").mockResolvedValue({
        schemaVersion: "liquidity-depth/2026-01",
        venue: validOrderbookFixture,
        curve: { bids: [], asks: [], midPrice: 0.121 },
        ladder: [],
        capacity: {
          thresholds: [],
          maxObservedDepthBase: "18000",
          maxObservedDepthQuote: "2178",
          hasInsufficientDepth: false,
          summary: "Healthy",
        },
        coverage: {
          status: "complete",
          reasons: [],
          modelAssumptions: [],
          lastObservedAt: new Date().toISOString(),
          ledgerOrBlock: 12345,
        },
        disclaimer: "Read-only research tool.",
      });

      const request = new NextRequest(
        "http://localhost/api/insights/liquidity-depth?base=XLM&quote=USDC&network=stellar-pubnet&side=buy&sizes=100,500",
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");

      const body = await response.json();
      expect(body.schemaVersion).toBe("liquidity-depth/2026-01");
      expect(body.venue.venueId).toBe(validOrderbookFixture.venueId);
    });

    it("returns 400 when required base parameter is missing", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockReturnValue(null);

      const request = new NextRequest(
        "http://localhost/api/insights/liquidity-depth?quote=USDC",
      );

      const response = await GET(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("Invalid query parameters");
    });

    it("enforces rate limits and returns 429 when exceeded", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockReturnValue(
        NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }),
      );

      const request = new NextRequest(
        "http://localhost/api/insights/liquidity-depth?base=XLM",
      );

      const response = await GET(request);
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBe("Rate limit exceeded");
    });
  });

  describe("POST /api/insights/liquidity-depth", () => {
    it("returns 200 with result and security headers for direct venue analysis", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockReturnValue(null);

      const request = new NextRequest("http://localhost/api/insights/liquidity-depth", {
        method: "POST",
        body: JSON.stringify({
          venue: validOrderbookFixture,
          side: "buy",
          sizes: ["500", "1000"],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");

      const body = await response.json();
      expect(body.schemaVersion).toBe("liquidity-depth/2026-01");
      expect(body.ladder).toHaveLength(2);
      expect(body.coverage.status).toBe("complete");
    });

    it("returns 400 for malformed payload body", async () => {
      vi.spyOn(rateLimitModule, "checkRateLimit").mockReturnValue(null);

      const request = new NextRequest("http://localhost/api/insights/liquidity-depth", {
        method: "POST",
        body: JSON.stringify({
          side: "invalid_direction",
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid request payload");
    });
  });
});
