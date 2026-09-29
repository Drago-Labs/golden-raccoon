import { expect, test } from "@playwright/test";

/**
 * Journey for the shared-exposure map.
 *
 * The analysis endpoint performs no outbound I/O — the caller supplies both the
 * holdings and the declared relationships — so the journey drives it directly
 * with a fixture. No live funds and no paid provider are involved.
 */
const REQUEST = {
  walletAddress: "GWALLETJOURNEY",
  network: "stellar-pubnet",
  holdings: [
    {
      symbol: "USDC",
      chainId: "stellar-pubnet",
      issuer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      balance: 1000,
      priceUsd: 1,
      priceStatus: "priced",
      valueUsd: 1000,
    },
    {
      symbol: "EURC",
      chainId: "stellar-pubnet",
      issuer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      balance: 500,
      priceUsd: 1,
      priceStatus: "priced",
      valueUsd: 500,
    },
    {
      symbol: "MYST",
      chainId: "stellar-pubnet",
      issuer: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      balance: 42,
      priceUsd: null,
      priceStatus: "unavailable",
      valueUsd: 0,
    },
  ],
  relationships: [
    {
      fromAssetKey: "USDC:GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      kind: "issuer",
      targetLabel: "Centre Consortium",
      provenance: "issuer_disclosure",
    },
    {
      fromAssetKey: "EURC:GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      kind: "issuer",
      targetLabel: "Centre Consortium",
      provenance: "issuer_disclosure",
    },
  ],
  observedAt: "2026-01-05T00:00:00.000Z",
};

test.describe("Shared exposure map", () => {
  test("renders the page shell and an explicit no-wallet state", async ({ page }) => {
    await page.goto("/insights/exposure-map");

    await expect(page.getByRole("heading", { name: "Shared exposure map", level: 1 })).toBeVisible();
    await expect(page.getByText(/No wallet is selected/i)).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/exposure-map");

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("groups shared issuers and reports exact totals", async ({ page }) => {
    await page.goto("/insights/exposure-map");

    const response = await page.request.post("/api/insights/exposure-map", { data: REQUEST });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const payload = await response.json();
    const group = payload.map.groups.find(
      (entry: { nodeId: string }) => entry.nodeId === "issuer:stellar-pubnet:centre consortium",
    );

    // 1000 USDC + 500 EURC in micro-USD, exactly.
    expect(group.totalMicroUsd).toBe(1_500_000_000);
    expect(group.holdingCount).toBe(2);
    expect(payload.map.coverage.state).toBe("partial");
    expect(payload.map.coverage.unpricedHoldingCount).toBe(1);
  });

  test("reports an unresolved holding rather than absorbing it into a total", async ({ page }) => {
    await page.goto("/insights/exposure-map");

    const response = await page.request.post("/api/insights/exposure-map", { data: REQUEST });
    const payload = await response.json();
    const unresolved = payload.map.unresolved.map((entry: { symbol: string }) => entry.symbol);

    expect(unresolved).toContain("MYST");
  });

  test("rejects a relationship declared with no provenance", async ({ page }) => {
    await page.goto("/insights/exposure-map");

    const response = await page.request.post("/api/insights/exposure-map", {
      data: { ...REQUEST, relationships: [{ fromAssetKey: "USDC", kind: "issuer", targetLabel: "Guess" }] },
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.map).toBeUndefined();
  });
});
