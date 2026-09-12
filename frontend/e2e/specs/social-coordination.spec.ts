import { expect, test } from "@playwright/test";

/**
 * Journey for the social pattern workbench.
 *
 * The endpoint performs no outbound I/O and calls no social API — the caller
 * supplies the observations — so the journey drives it with a synthetic
 * fixture. Every author key is an obvious placeholder; no real account appears.
 */
const COPY = "Do not miss this token it is going to run hard today get in before the listing";
const ORGANIC = [
  "The listing announcement explains the vesting schedule in more detail than the earlier post",
  "Anyone know whether the vesting cliff applies to the team allocation or only to the treasury",
  "Reading the docs now, the cliff looks like twelve months with monthly unlocks after that",
  "The audit report is linked from the docs page, published two weeks before the listing date",
  "Worth noting the audit only covers the vault contract and not the router they added later",
  "Volume looks normal compared to the last two listings on the same venue during this quarter",
  "Liquidity is thinner than the announcement implied, roughly a third of what was promised",
  "The team answered the vesting question in their channel, screenshot is in the thread above",
  "That screenshot is from the previous announcement, the numbers changed in the final version",
  "Comparing both versions, the treasury allocation went up and the community share went down",
  "Someone should ask whether the router contract will be audited before the next phase begins",
  "They said the router audit is scheduled but did not commit to publishing it before launch",
];

const REQUEST = {
  observedAt: "2026-01-05T12:00:00.000Z",
  sampleIsExhaustive: true,
  observations: [
    ...ORGANIC.map((text, index) => ({
      observationId: `baseline-${index}`,
      authorKey: `account-baseline-${index}`,
      postedAt: `2026-01-05T10:${String(index).padStart(2, "0")}:00.000Z`,
      text,
    })),
    ...Array.from({ length: 40 }, (_, index) => ({
      observationId: `burst-${index}`,
      authorKey: `account-burst-${index % 4}`,
      postedAt: `2026-01-05T10:30:${String(index % 60).padStart(2, "0")}.000Z`,
      text: COPY,
    })),
  ],
};

test.describe("Social pattern workbench", () => {
  test("renders the page shell and an explicit empty state", async ({ page }) => {
    await page.goto("/insights/social-coordination");

    await expect(page.getByRole("heading", { name: "Social pattern workbench", level: 1 })).toBeVisible();
    await expect(page.getByText(/No observations are loaded/i)).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/social-coordination");

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("measures repetition and publishes the threshold behind it", async ({ page }) => {
    await page.goto("/insights/social-coordination");

    const response = await page.request.post("/api/insights/social-coordination", { data: REQUEST });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const payload = await response.json();

    expect(payload.report.clusters[0].observationIds).toHaveLength(40);
    expect(payload.report.clusters[0].distinctAuthorCount).toBe(4);
    expect(payload.report.thresholds.repeatSimilarity).toBe(0.9);
    expect(payload.report.scoreUnchanged).toBe(true);

    for (const finding of payload.report.findings) {
      expect(finding.limitation).toMatch(/no account is described as a bot/i);
    }
  });

  test("returns insufficient evidence for a small sample", async ({ page }) => {
    await page.goto("/insights/social-coordination");

    const response = await page.request.post("/api/insights/social-coordination", {
      data: { observedAt: "2026-01-05T12:00:00.000Z", observations: REQUEST.observations.slice(0, 4) },
    });
    const payload = await response.json();

    expect(payload.report.coverage.state).toBe("insufficient");
    expect(payload.report.findings[0].strength).toBe("insufficient_evidence");
  });

  test("rejects an unreadable observation time", async ({ page }) => {
    await page.goto("/insights/social-coordination");

    const response = await page.request.post("/api/insights/social-coordination", {
      data: { ...REQUEST, observedAt: "not-a-date" },
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.report).toBeUndefined();
  });
});
