import { test, expect } from "./fixtures/test";

test.describe("Input validation", () => {
  test("scan page validates empty input gracefully", async ({ page }) => {
    await page.goto("/scan");

    const scanButton = page.locator('button:has-text("Run token agents")').first();

    await scanButton.click();
    await expect(page.getByRole("heading", { name: "Scan failed" })).not.toBeVisible({ timeout: 3000 });
  });

  test("deep scan requires wallet for detailed scan", async ({ page }) => {
    await page.goto("/scan");

    const deepScanButton = page.locator('button:has-text("Run deep scan agents")');
    await deepScanButton.click();

    await expect(page.getByRole("heading", { name: "Connect wallet" })).toBeVisible({ timeout: 5000 });
  });

  test("shows amount due for deep scan", async ({ page }) => {
    await page.goto("/scan");

    const deepScanButton = page.locator('button:has-text("Run deep scan agents")');
    await deepScanButton.click();

    await expect(page.getByRole("heading", { name: "Connect wallet" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("x402 payment", { exact: true })).toBeVisible();
  });

  test("handles malformed contract address", async ({ page }) => {
    await page.route("**/api/scan/token", async (route) => {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Invalid contract address format" }) });
    });

    await page.goto("/scan");

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("not-a-valid-address");

    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.getByRole("heading", { name: "Scan failed" })).toBeVisible({ timeout: 15000 });
  });

  test("displays error for unsupported network", async ({ page }) => {
    await page.route("**/api/scan/token", async (route) => {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Unsupported network for this contract" }) });
    });

    await page.goto("/scan");

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");

    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.getByRole("heading", { name: "Scan failed" })).toBeVisible({ timeout: 15000 });
  });
});
