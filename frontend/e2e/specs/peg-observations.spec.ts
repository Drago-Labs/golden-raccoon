import { expect, test } from "@playwright/test";

/**
 * Journey for the peg deviation workspace.
 *
 * The endpoint is stateless and performs no outbound I/O — declarations,
 * observations and rates all come from the caller — so the journey drives it
 * with a fixture. No live funds and no paid provider are involved.
 */
const REQUEST = {
  windowStart: "2026-01-01T00:00:00.000Z",
  windowEnd: "2026-01-02T00:00:00.000Z",
  thresholdBps: 50,
  maxGapSeconds: 7200,
  staleAfterSeconds: 86400,
  rateToleranceSeconds: 3600,
  definitions: [
    {
      asset: { chainId: "stellar-pubnet", symbol: "EURC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
      referenceCurrency: "EUR",
      targetValue: "0.83",
      provenance: "issuer_disclosure",
    },
  ],
  series: [
    {
      asset: { chainId: "stellar-pubnet", symbol: "EURC", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
      observations: [
        { observedAt: "2026-01-01T00:00:00.000Z", price: "0.83", currency: "EUR", sourceLabel: "SDEX mid" },
        { observedAt: "2026-01-01T01:00:00.000Z", price: "0.8217", currency: "EUR", sourceLabel: "SDEX mid" },
        { observedAt: "2026-01-01T02:00:00.000Z", price: "0.83", currency: "EUR", sourceLabel: "SDEX mid" },
      ],
    },
    {
      // No declaration for this one: it must be listed, not measured.
      asset: { chainId: "stellar-pubnet", symbol: "USDX", issuer: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" },
      observations: [
        { observedAt: "2026-01-01T00:00:00.000Z", price: "0.40", currency: "USD", sourceLabel: "SDEX mid" },
      ],
    },
  ],
  referenceRates: [],
};

test.describe("Peg deviation workspace", () => {
  test("renders the page shell and an explicit empty state", async ({ page }) => {
    await page.goto("/insights/peg-observations");

    await expect(page.getByRole("heading", { name: "Peg deviation workspace", level: 1 })).toBeVisible();
    await expect(page.getByText(/No observation series is loaded/i)).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/peg-observations");

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("requires a reference currency before declaring a peg", async ({ page }) => {
    await page.goto("/insights/peg-observations");

    await page.getByLabel("Network").fill("ethereum");
    await page.getByLabel("Symbol").fill("DAI");
    await page.getByRole("button", { name: /Declare peg and analyse/i }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "A reference currency is required. This feature does not assume US dollars.",
    );
  });

  test("measures against the declared target, not a dollar", async ({ page }) => {
    await page.goto("/insights/peg-observations");

    const response = await page.request.post("/api/insights/peg-observations", { data: REQUEST });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const payload = await response.json();
    const eurc = payload.report.assets[0];

    expect(eurc.definition.referenceCurrency).toBe("EUR");
    expect(eurc.definition.targetValue).toBe("0.83");
    // 0.8217 against 0.83 is exactly -100 bps.
    expect(eurc.observations[1].deviationBps).toBe(-100);
  });

  test("lists an undeclared asset rather than assuming a target for it", async ({ page }) => {
    await page.goto("/insights/peg-observations");

    const response = await page.request.post("/api/insights/peg-observations", { data: REQUEST });
    const payload = await response.json();

    expect(payload.report.undefinedAssets).toHaveLength(1);
    expect(payload.report.undefinedAssets[0].symbol).toBe("USDX");
  });

  test("rejects a window that does not move forward", async ({ page }) => {
    await page.goto("/insights/peg-observations");

    const response = await page.request.post("/api/insights/peg-observations", {
      data: { ...REQUEST, windowStart: "2026-01-02T00:00:00.000Z", windowEnd: "2026-01-01T00:00:00.000Z" },
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.report).toBeUndefined();
  });
});
