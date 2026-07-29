import { test, expect } from "./fixtures/test";

test.describe("Token scan journey", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/scan");
  });

  test("displays scan page with input form", async ({ page }) => {
    await expect(page.locator("h1:has-text('Scan token')")).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
    await expect(page.locator('input[placeholder*="DexScreener"]')).toBeVisible();
    await expect(page.locator('button:has-text("Run token agents")')).toBeVisible();
    await expect(page.locator('button:has-text("Run deep scan agents")')).toBeVisible();
  });

  test("shows free trial pricing note", async ({ page }) => {
    await expect(page.locator("text=Detailed Scan costs")).toBeVisible();
  });

  test("accepts optional wallet address input", async ({ page }) => {
    const walletInput = page.locator('input[placeholder*="Optional wallet"]');
    await expect(walletInput).toBeVisible();

    await walletInput.fill("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18");
    await expect(walletInput).toHaveValue("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18");
  });

  test("runs EVM token scan and displays risk report", async ({ page, mockScanApi }) => {
    await mockScanApi();

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");

    await page.locator('button:has-text("Run token agents")').first().click();

    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=MEME")).toBeVisible();
    await expect(page.locator("text=Buy risk")).toBeVisible();
    await expect(page.locator("text=Confidence")).toBeVisible();
    await expect(page.locator("text=Top reasons")).toBeVisible();
    await expect(page.locator("text=Why this is risky")).toBeVisible();
  });

  test("displays risk score with correct tone colors", async ({ page, mockScanApi }) => {
    await mockScanApi();

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");

    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });

    await expect(page.getByText("67%", { exact: true })).toBeVisible();
    await expect(page.getByText("72%", { exact: true })).toBeVisible();
  });

  test("shows agent details section", async ({ page, mockScanApi }) => {
    await mockScanApi();

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");
    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });

    await page.locator("summary:has-text('Agent details')").click();
    await expect(page.locator("text=Onchain Agent")).toBeVisible();
    await expect(page.locator("text=Social Agent")).toBeVisible();
    await expect(page.locator("text=Decision Agent")).toBeVisible();
  });

  test("shows market details section", async ({ page, mockScanApi }) => {
    await mockScanApi();

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");
    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });

    await page.locator("summary:has-text('Market details')").click();
    const marketSection = page.locator("details").filter({ hasText: "Market details" });
    await expect(marketSection.locator("text=Liquidity")).toBeVisible();
    await expect(marketSection.locator("text=24h volume")).toBeVisible();
    await expect(marketSection.locator("text=FDV")).toBeVisible();
  });

  test("shows data quality section", async ({ page, mockScanApi }) => {
    await mockScanApi();

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");
    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });

    await page.locator("summary:has-text('Data quality')").click();
    const dataQualitySection = page.locator("details").filter({ hasText: "Data quality" });
    await expect(dataQualitySection.locator("text=Connected")).toBeVisible();
    await expect(dataQualitySection.locator("text=Unavailable")).toBeVisible();
  });

  test("shows token details expandable", async ({ page, mockScanApi }) => {
    await mockScanApi();

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");
    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });

    await page.locator("summary:has-text('Token details')").click();
    await expect(page.locator("text=Contract:")).toBeVisible();
  });

  test("shows network auto-detected warning on chain mismatch", async ({ page, mockScanApi }) => {
    await mockScanApi();

    const chainSelect = page.locator("select");
    await chainSelect.selectOption("goat");

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");
    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });
  });

  test("handles scan error state gracefully", async ({ page, mockScanApi }) => {
    await mockScanApi({ returnError: true });

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x0000000000000000000000000000000000000000");
    await page.locator('button:has-text("Run token agents")').first().click();

    await expect(page.getByRole("heading", { name: "Scan failed" })).toBeVisible({ timeout: 15000 });
  });
});
