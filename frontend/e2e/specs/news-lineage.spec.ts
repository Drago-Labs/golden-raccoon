import { expect, test } from "@playwright/test";

/**
 * Journey for story lineage analysis.
 *
 * The endpoint performs no outbound I/O — it canonicalizes URLs as strings and
 * never fetches one — so the journey drives it with a fixture. No live funds
 * and no paid provider are involved.
 */
const WIRE_BODY =
  "The issuer announced a scheduled audit of its reserve holdings covering the fourth quarter, with results expected to be published by an independent accounting firm before the end of the month.";

const REQUEST = {
  observedAt: "2026-01-05T12:00:00.000Z",
  articles: [
    {
      articleId: "wire-origin",
      originalId: "provider-1001",
      title: "Issuer schedules reserve audit",
      summary: WIRE_BODY,
      url: "https://wire.example/news/reserve-audit",
      publishedAt: "2026-01-05T08:00:00.000Z",
      language: "en",
    },
    {
      articleId: "syndicated-a",
      title: "Issuer schedules reserve audit",
      summary: WIRE_BODY,
      url: "https://alpha-news.example/finance/reserve-audit?utm_source=feed",
      syndicatedFrom: "wire.example",
      publishedAt: "2026-01-05T08:30:00.000Z",
      language: "en",
    },
    {
      articleId: "syndicated-b",
      title: "Reserve audit scheduled by issuer",
      summary: WIRE_BODY,
      url: "https://beta-press.example/markets/reserve-audit",
      syndicatedFrom: "https://wire.example",
      publishedAt: "2026-01-05T09:00:00.000Z",
      language: "en",
    },
    {
      articleId: "adversarial",
      title: "<script>alert(1)</script>Unrelated headline about the audit process",
      summary: "A separate desk reviewed filings and interviewed two people with direct knowledge of the arrangement.",
      url: "https://gamma-review.example/investigations/audit",
      publishedAt: "2026-01-05T10:00:00.000Z",
      language: "en",
    },
  ],
};

test.describe("Story lineage", () => {
  test("renders the page shell and an explicit empty state", async ({ page }) => {
    await page.goto("/insights/news-lineage");

    await expect(page.getByRole("heading", { name: "Story lineage", level: 1 })).toBeVisible();
    await expect(page.getByText(/No article evidence is loaded/i)).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/news-lineage");

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("counts syndicated copies as one report", async ({ page }) => {
    await page.goto("/insights/news-lineage");

    const response = await page.request.post("/api/insights/news-lineage", { data: REQUEST });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const payload = await response.json();
    const syndication = payload.report.corroboration.find(
      (entry: { state: string }) => entry.state === "syndication_only",
    );

    expect(syndication.independentReportCount).toBe(1);
    expect(payload.report.scoreUnchanged).toBe(true);
  });

  test("never returns markup from a provider title", async ({ page }) => {
    await page.goto("/insights/news-lineage");

    const response = await page.request.post("/api/insights/news-lineage", { data: REQUEST });
    const body = await response.text();

    expect(body).not.toContain("<script>");
  });

  test("rejects an unreadable observation time", async ({ page }) => {
    await page.goto("/insights/news-lineage");

    const response = await page.request.post("/api/insights/news-lineage", {
      data: { ...REQUEST, observedAt: "not-a-date" },
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.report).toBeUndefined();
  });
});
