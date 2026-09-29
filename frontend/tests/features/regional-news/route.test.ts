import { describe, expect, it, vi, beforeEach } from "vitest";
import { multilingualFeeds } from "./fixtures";

const mocks = vi.hoisted(() => ({ rate: vi.fn() }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/regional-news/route";

describe("POST /api/insights/regional-news", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
  });

  it("returns a report with original language preserved", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/regional-news", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ observedAt: "2026-09-01T12:00:00.000Z", feeds: multilingualFeeds }),
      }) as never,
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.scoreUnchanged).toBe(true);
    expect(payload.report.articles.some((article: { translation: { originalTitle: string } }) => article.translation.originalTitle.includes("ステーブル"))).toBe(true);
  });

  it("rejects invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/regional-news", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{bad",
      }) as never,
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid observedAt", async () => {
    const response = await POST(
      new Request("http://localhost/api/insights/regional-news", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ observedAt: "not-a-date" }),
      }) as never,
    );
    expect(response.status).toBe(400);
  });
});
