import { test, expect } from "./fixtures/test";

test.describe("Approval and execution", () => {
  test("shows execution details in scan report", async ({ page, mockScanApi }) => {
    await mockScanApi();

    await page.goto("/scan");

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");
    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });

    await page.locator("summary:has-text('Execution details')").click();
    const execSection = page.locator("details").filter({ hasText: "Execution details" });
    await expect(execSection.getByRole("heading", { name: /Suggested action/ })).toBeVisible();
    await expect(execSection.getByText("monitor", { exact: true })).toBeVisible();
    await expect(execSection.getByText("Wallet approval", { exact: true })).toBeVisible();
    await expect(execSection.getByText("required", { exact: true })).toBeVisible();
  });

  test("shows auto-execute disabled notice", async ({ page, mockScanApi }) => {
    await mockScanApi();

    await page.goto("/scan");

    const input = page.locator('input[placeholder*="DexScreener"]');
    await input.fill("0x1234567890abcdef1234567890abcdef12345678");
    await page.locator('button:has-text("Run token agents")').first().click();
    await expect(page.locator("text=AI Risk Report")).toBeVisible({ timeout: 15000 });

    await page.locator("summary:has-text('Execution details')").click();
    await expect(page.getByText("Auto execute is off")).toBeVisible();
  });

  test("deep scan requests payment before execution", async ({ page }) => {
    await page.goto("/scan");

    await page.locator('button:has-text("Run deep scan agents")').click();
    await expect(page.getByRole("heading", { name: "Connect wallet" })).toBeVisible({ timeout: 5000 });
  });

  test("wallet is required before deep scan can proceed", async ({ page }) => {
    await page.goto("/scan");

    await page.locator('button:has-text("Run deep scan agents")').click();
    await expect(page.getByRole("heading", { name: "Connect wallet" })).toBeVisible({ timeout: 5000 });
  });

  test("deep scan shows price per scan", async ({ page }) => {
    await page.goto("/scan");

    await page.locator('button:has-text("Run deep scan agents")').click();
    await expect(page.getByText("$0.99", { exact: true })).toBeVisible({ timeout: 5000 });
  });
});
