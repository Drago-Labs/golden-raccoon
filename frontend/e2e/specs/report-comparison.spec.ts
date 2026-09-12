import { expect, test } from "@playwright/test";

/**
 * Journey for snapshot comparison.
 *
 * The only external dependency is the app's own snapshot store, which the
 * journey seeds by creating two snapshots through the public API. No live
 * funds and no paid provider are involved.
 */
test.describe("Snapshot comparison", () => {
  test("renders the workspace and an explicit empty state", async ({ page }) => {
    await page.goto("/insights/report-comparison");

    await expect(page.getByRole("heading", { name: "Snapshot comparison", level: 1 })).toBeVisible();
    await expect(page.getByText(/No comparison yet/i)).toBeVisible();
    await expect(page.getByLabel(/Earlier snapshot id/i)).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/report-comparison");

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("validates the selector before issuing a request", async ({ page }) => {
    await page.goto("/insights/report-comparison");

    await page.getByLabel(/Earlier snapshot id/i).fill("snapshot_same-id");
    await page.getByLabel(/Later snapshot id/i).fill("snapshot_same-id");
    await page.getByRole("button", { name: /Compare snapshots/i }).click();

    await expect(page.getByRole("alert")).toHaveText("Choose two different snapshots.");
  });

  test("is reachable by keyboard from the first field to the submit button", async ({ page }) => {
    await page.goto("/insights/report-comparison");

    await page.getByLabel(/Earlier snapshot id/i).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel(/Later snapshot id/i)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /Compare snapshots/i })).toBeFocused();
  });

  test("fails closed for a snapshot that does not exist", async ({ page }) => {
    await page.goto("/insights/report-comparison");

    const response = await page.request.get(
      "/api/insights/report-comparison?leftId=snapshot_missing-left&rightId=snapshot_missing-right",
    );

    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const payload = await response.json();
    expect(payload.comparison).toBeUndefined();
    expect(payload.error).toBe("not_found");
  });

  test("rejects an id that is not shaped like a snapshot id", async ({ page }) => {
    await page.goto("/insights/report-comparison");

    const response = await page.request.get(
      "/api/insights/report-comparison?leftId=../../etc/passwd&rightId=snapshot_whatever",
    );

    expect(response.status()).toBe(400);
  });
});
