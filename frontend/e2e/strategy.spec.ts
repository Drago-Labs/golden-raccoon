import { test, expect } from "./fixtures/test";

test.describe("Strategy page", () => {
  test("displays risk rules page with title", async ({ page }) => {
    await page.goto("/strategy");

    await expect(page.locator("h1:has-text('Risk rules')")).toBeVisible();
    await expect(page.locator("text=Wallet approval required")).toBeVisible();
  });

  test("shows three rule sliders with default values", async ({ page }) => {
    await page.goto("/strategy");

    await expect(page.locator("text=Max risk")).toBeVisible();
    await expect(page.locator("text=Max trade")).toBeVisible();
    await expect(page.locator("text=Meme cap")).toBeVisible();

    await expect(page.locator("text=80%").first()).toBeVisible();
    await expect(page.locator("text=20%")).toBeVisible();
    await expect(page.locator("text=10%")).toBeVisible();
  });

  test("allows editing risk rule via slider", async ({ page }) => {
    await page.goto("/strategy");

    const slider = page.locator('input[type="range"]').first();
    await slider.focus();
    await page.keyboard.press("ArrowRight");

    const sliderValue = await slider.inputValue();
    expect(Number(sliderValue)).toBeGreaterThan(0);
    await expect(page.locator("span.font-medium").first()).toHaveText(`${sliderValue}%`);
  });

  test("shows save button", async ({ page }) => {
    await page.goto("/strategy");

    await expect(page.locator('button:has-text("Save")')).toBeVisible();
  });

  test("displays saved confirmation after saving rules via API", async ({ page }) => {
    await page.route("**/api/rules", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ maxRiskScore: 70, maxTradePercent: 25, maxMemeExposurePercent: 15 }) });
      }
    });

    await page.goto("/strategy");

    await page.locator('button:has-text("Save")').click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 5000 });
  });

  test("edits all three sliders and saves", async ({ page }) => {
    await page.route("**/api/rules", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/strategy");

    const sliders = page.locator('input[type="range"]');
    for (let i = 0; i < 3; i++) {
      await sliders.nth(i).focus();
      for (let j = 0; j < 10; j++) {
        await page.keyboard.press("ArrowRight");
      }
    }

    for (let i = 0; i < 3; i++) {
      const val = await sliders.nth(i).inputValue();
      expect(Number(val)).toBeGreaterThan(0);
    }

    await page.locator('button:has-text("Save")').click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 5000 });
  });
});
