import { test, expect } from "./fixtures/test";

test.describe("History page", () => {
  test("displays history page with section headers", async ({ page }) => {
    await page.goto("/history");

    await expect(page.locator("h1:has-text('History')")).toBeVisible();
    await expect(page.locator("h2:has-text('Agent runs')")).toBeVisible();
  });

  test('shows "no saved agent runs" when empty', async ({ page }) => {
    await page.goto("/history");

    await expect(page.locator("text=No saved agent runs yet")).toBeVisible();
  });

  test("shows recent activity accordion with three sections", async ({ page }) => {
    await page.goto("/history");

    await page.locator("summary:has-text('Recent activity')").click();
    const activitySection = page.locator("details").filter({ hasText: "Recent activity" });
    await expect(activitySection.getByText("Recommendations", { exact: true })).toBeVisible();
    await expect(activitySection.getByText("Approvals", { exact: true })).toBeVisible();
    await expect(activitySection.getByText("Transactions", { exact: true })).toBeVisible();
  });

  test("shows empty state for recommendations", async ({ page }) => {
    await page.goto("/history");

    await page.locator("summary:has-text('Recent activity')").click();
    await expect(page.locator("text=No recommendation records yet.")).toBeVisible();
  });

  test("shows empty state for approvals", async ({ page }) => {
    await page.goto("/history");

    await page.locator("summary:has-text('Recent activity')").click();
    await expect(page.locator("text=No wallet approvals yet.")).toBeVisible();
  });

  test("shows empty state for transactions", async ({ page }) => {
    await page.goto("/history");

    await page.locator("summary:has-text('Recent activity')").click();
    await expect(page.locator("text=No stored transactions yet.")).toBeVisible();
  });
});
