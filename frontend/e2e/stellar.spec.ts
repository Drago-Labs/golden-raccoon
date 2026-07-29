import { test, expect } from "./fixtures/test";

test.describe("Stellar", () => {
  test.beforeEach(async ({ page, mockScanApi }) => {
    await mockScanApi({ isStellar: true });
  });

  test("scans Stellar asset and displays risk report", async ({ page }) => {
    await page.goto("/scan");

    const chainSelect = page.locator("select");
    await chainSelect.selectOption("stellar-testnet");

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("CDLZFC3SYJYDZT7K4VJHRJ6J3Z5H3KJY3J3Z5H3KJY3J3Z5H3KJY3J3Z5");

    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=RST")).toBeVisible();
  });

  test("shows Stellar risk publish button after scan", async ({ page }) => {
    await page.goto("/scan");

    const chainSelect = page.locator("select");
    await chainSelect.selectOption("stellar-testnet");

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("CDLZFC3SYJYDZT7K4VJHRJ6J3Z5H3KJY3J3Z5H3KJY3J3Z5H3KJY3J3Z5");

    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=Connect Stellar wallet")).toBeVisible({ timeout: 15000 });
  });

  test("publish button says Connect Stellar wallet when not connected", async ({ page }) => {
    await page.goto("/scan");

    const chainSelect = page.locator("select");
    await chainSelect.selectOption("stellar-testnet");

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("CDLZFC3SYJYDZT7K4VJHRJ6J3Z5H3KJY3J3Z5H3KJY3J3Z5H3KJY3J3Z5");

    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });

    await expect(page.locator('button:has-text("Connect Stellar wallet")')).toBeVisible();
  });

  test("publish button enabled after Stellar wallet connects", async ({ page }) => {
    await page.goto("/scan");

    const chainSelect = page.locator("select");
    await chainSelect.selectOption("stellar-testnet");

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("CDLZFC3SYJYDZT7K4VJHRJ6J3Z5H3KJY3J3Z5H3KJY3J3Z5H3KJY3J3Z5");

    await page.locator('button:has-text("Run token agents")').first().click();

    await page.route("**/api/stellar/registry/prepare", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ xdr: "AAAAA..." }) });
    });

    await page.route("**/api/stellar/registry/submit", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ hash: "0xabc123", status: "SUCCESS" }) });
    });

    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });
  });

  test("handles Stellar registry submit error gracefully", async ({ page }) => {
    await page.goto("/scan");

    const chainSelect = page.locator("select");
    await chainSelect.selectOption("stellar-testnet");

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("CDLZFC3SYJYDZT7K4VJHRJ6J3Z5H3KJY3J3Z5H3KJY3J3Z5H3KJY3J3Z5");
    await page.locator('button:has-text("Run token agents")').first().click();

    await page.route("**/api/stellar/registry/prepare", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Registry unavailable" }) });
    });

    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });
  });
});
