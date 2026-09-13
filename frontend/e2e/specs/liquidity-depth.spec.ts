import { expect, test } from "@playwright/test";

/**
 * Journey for the liquidity depth workbench.
 *
 * The endpoint performs no outbound I/O — the caller supplies the venue
 * snapshots — so the journey drives it directly with a hand-calculated fixture.
 * No live funds and no paid provider are involved.
 */
const REQUEST = {
  side: "sell_base",
  now: "2026-01-05T12:00:00.000Z",
  ladder: ["1000000000", "1500000000", "5000000000"],
  venues: [
    {
      venueId: "stellar-sdex",
      label: "Stellar SDEX",
      model: "orderbook",
      base: { chainId: "stellar-pubnet", symbol: "XLM", decimals: 7 },
      quote: {
        chainId: "stellar-pubnet",
        symbol: "USDC",
        decimals: 7,
        issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      },
      observedAt: "2026-01-05T11:59:30.000Z",
      ledgerOrBlock: "54321000",
      feeBps: 0,
      truncated: false,
      bids: [
        { price: "0.50", baseAmount: "1000000000" },
        { price: "0.49", baseAmount: "1000000000" },
        { price: "0.45", baseAmount: "1000000000" },
      ],
      asks: [],
    },
  ],
};

test.describe("Liquidity depth workbench", () => {
  test("renders the page shell and an explicit empty state", async ({ page }) => {
    await page.goto("/insights/liquidity-depth");

    await expect(page.getByRole("heading", { name: "Liquidity depth workbench", level: 1 })).toBeVisible();
    await expect(page.getByText(/No venue snapshot is loaded/i)).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/liquidity-depth");

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("returns the hand-calculated fill and impact", async ({ page }) => {
    await page.goto("/insights/liquidity-depth");

    const response = await page.request.post("/api/insights/liquidity-depth", { data: REQUEST });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const payload = await response.json();
    const rung = payload.report.venues[0].ladder.find(
      (entry: { requestedBaseAmount: string }) => entry.requestedBaseAmount === "1500000000",
    );

    // 100 XLM @ 0.50 + 50 XLM @ 0.49 = 74.5 USDC, exactly.
    expect(rung.quoteAmount).toBe("745000000");
    expect(rung.effectivePrice).toBe("0.496666666666666666");
    expect(rung.priceImpactBps).toBe(66);
    expect(payload.report.informationalOnly).toBe(true);
  });

  test("reports a size beyond the book as partial rather than clamping it", async ({ page }) => {
    await page.goto("/insights/liquidity-depth");

    const response = await page.request.post("/api/insights/liquidity-depth", { data: REQUEST });
    const payload = await response.json();
    const rung = payload.report.venues[0].ladder.find(
      (entry: { requestedBaseAmount: string }) => entry.requestedBaseAmount === "5000000000",
    );

    expect(rung.status).toBe("partial");
    expect(rung.fillableBaseAmount).toBe("3000000000");
  });

  test("rejects a ladder that is not strictly ascending", async ({ page }) => {
    await page.goto("/insights/liquidity-depth");

    const response = await page.request.post("/api/insights/liquidity-depth", {
      data: { ...REQUEST, ladder: ["100", "100"] },
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.report).toBeUndefined();
  });
});
