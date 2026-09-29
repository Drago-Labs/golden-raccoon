import { expect, test } from "@playwright/test";

/**
 * Journey for the risk explanation workbench.
 *
 * The feature performs no outbound I/O: it reads a report the caller already
 * holds and derives a document from it. The journey therefore needs no network
 * mocking beyond the app itself, and runs without funds or paid services.
 */
const REPORT = {
  id: "e2e-report-001",
  chain: "ethereum",
  contractAddress: "0x2222222222222222222222222222222222222222",
  symbol: "E2E",
  buyRisk: 58,
  confidence: 0.66,
  verdict: "watch",
  summary: "Journey fixture report.",
  topReasons: ["Thin liquidity"],
  input: { chain: "ethereum", assetType: "contract" },
  agentCards: [
    {
      agent: "onchain",
      displayName: "On-chain analyst",
      score: 58,
      scoreKind: "risk",
      confidence: 0.66,
      status: "complete",
      summary: "Journey fixture agent.",
      factors: [
        {
          label: "Owner can mint",
          category: "owner_controls",
          impact: 72,
          severity: "critical",
          detail: "Unrestricted mint function.",
          sourceLabel: "GoPlus",
          direction: "risk_increase",
        },
        {
          label: "Context note",
          category: "owner_controls",
          impact: 0,
          severity: "low",
          detail: "Descriptive only.",
          direction: "neutral",
        },
      ],
      criticalFactors: [],
      sources: [{ label: "GoPlus", status: "connected" }],
      missingData: [],
    },
  ],
  sources: [{ label: "GoPlus", status: "connected" }],
  missingData: [],
  createdAt: "2026-01-08T10:00:00.000Z",
};

test.describe("Risk explanation workbench", () => {
  test("renders the workbench shell and an explicit empty state", async ({ page }) => {
    await page.goto("/insights/risk-explanations");

    await expect(page.getByRole("heading", { name: "Risk explanation workbench", level: 1 })).toBeVisible();
    await expect(page.getByText(/No report is selected/i)).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/risk-explanations");

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("analyses a report through the ephemeral endpoint", async ({ page }) => {
    await page.goto("/insights/risk-explanations");

    const response = await page.request.post("/api/insights/risk-explanations", {
      data: { reportVersion: "risk-report/v1", report: REPORT },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const payload = await response.json();
    const labels = payload.explanation.contributions.map((entry: { label: string }) => entry.label);

    expect(labels).toContain("Owner can mint");
    expect(payload.explanation.criticalBlockers).toHaveLength(1);
    expect(payload.explanation.reconciliation.attributedBuyRisk).toBeNull();

    const descriptive = payload.explanation.contributions.find((entry: { label: string }) => entry.label === "Context note");
    expect(descriptive.kind).toBe("descriptive");
    expect(descriptive.impact).toBeNull();
    expect(descriptive.evidence.state).toBe("unlinked");
  });

  test("rejects an unsupported report version without partial output", async ({ page }) => {
    await page.goto("/insights/risk-explanations");

    const response = await page.request.post("/api/insights/risk-explanations", {
      data: { reportVersion: "risk-report/v9", report: REPORT },
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.explanation).toBeUndefined();
  });
});
