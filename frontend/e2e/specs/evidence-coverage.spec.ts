import { expect, test } from "@playwright/test";

/**
 * Journey for the evidence coverage explorer.
 *
 * The endpoint performs no outbound I/O — the caller supplies the report — so
 * the journey drives it with a fixture. No live funds and no paid provider are
 * involved.
 */
const SUBJECT = {
  chainId: "stellar-pubnet",
  symbol: "USDC",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

const REQUEST = {
  reportId: "journey-report",
  generatedAt: "2026-01-05T12:00:00.000Z",
  staleAfterSeconds: 900,
  families: [
    {
      familyId: "vendor-alpha",
      label: "Alpha Data",
      memberLabels: ["Alpha Primary", "Alpha Mirror"],
      rationale: "Both endpoints are operated by Alpha Data and resell one upstream feed.",
    },
  ],
  claims: [
    {
      claimId: "claim-supply",
      label: "Circulating supply",
      subject: SUBJECT,
      observations: [
        {
          observationId: "supply-a",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: "2026-01-05T11:59:00.000Z",
          value: { kind: "number", amount: "1000000", unit: "USDC" },
          raw: { apiKey: "sk-live-must-not-appear", walletSeed: "must-not-appear" },
        },
        {
          observationId: "supply-b",
          sourceLabel: "Alpha Mirror",
          status: "connected",
          observedAt: "2026-01-05T11:59:00.000Z",
          value: { kind: "number", amount: "1000000", unit: "USDC" },
        },
      ],
    },
  ],
};

test.describe("Evidence coverage explorer", () => {
  test("renders the page shell and an explicit empty state", async ({ page }) => {
    await page.goto("/insights/evidence-coverage");

    await expect(page.getByRole("heading", { name: "Evidence coverage explorer", level: 1 })).toBeVisible();
    await expect(page.getByText(/No report is loaded/i)).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/evidence-coverage");

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("does not count one family's repeats as corroboration", async ({ page }) => {
    await page.goto("/insights/evidence-coverage");

    const response = await page.request.post("/api/insights/evidence-coverage", { data: REQUEST });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const payload = await response.json();
    const claim = payload.report.claims[0];

    expect(claim.observationIds).toHaveLength(2);
    expect(claim.independentFamilyCount).toBe(1);
    expect(claim.state).toBe("single_family");
  });

  test("never returns a provider payload", async ({ page }) => {
    await page.goto("/insights/evidence-coverage");

    const response = await page.request.post("/api/insights/evidence-coverage", { data: REQUEST });
    const body = await response.text();

    expect(body).not.toContain("must-not-appear");
    expect(body).not.toContain("sk-live");
  });

  test("rejects a family declared with no rationale", async ({ page }) => {
    await page.goto("/insights/evidence-coverage");

    const response = await page.request.post("/api/insights/evidence-coverage", {
      data: { ...REQUEST, families: [{ familyId: "x", label: "X", memberLabels: ["Alpha Primary"] }] },
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.report).toBeUndefined();
  });
});
