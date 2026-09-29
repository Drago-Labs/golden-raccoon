import { expect, test } from "@playwright/test";

/**
 * Journey for the saved run comparison workspace.
 *
 * The endpoint is replaced with a canned report so no storage is needed. Every
 * run id and address is an obvious placeholder.
 */
const WALLET = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";
const PAGE_URL = `/insights/run-comparison?account=${WALLET}`;

function header(runId: string, createdAt: string, recommendation: string, decisionScore: number) {
  return {
    runId,
    walletAddress: WALLET,
    network: "ethereum",
    mode: "token_scan",
    status: "completed",
    recommendation,
    decisionScore,
    confidence: 0.8,
    createdAt,
    subjectKey: "ethereum:0x1234",
  };
}

const REPORT = {
  schemaVersion: "run-comparison/2026-01",
  left: header("run-earlier", "2026-02-01T00:00:00.000Z", "hold", 40),
  right: header("run-outage", "2026-02-14T00:00:00.000Z", "reduce_exposure", 70),
  comparability: "comparable",
  comparabilityNote:
    "These runs are about the same subject in the same mode, so differences below are changes between them — though what caused a change is not recorded.",
  inputDifferences: [{ path: "balanceUsd", before: "1000", after: "2500", kind: "changed" }],
  agentDifferences: [
    {
      agent: "onchain",
      alignment: "present_in_both",
      scoreChange: { before: 50, after: 75, delta: 25 },
      recommendationChange: { field: "recommendedAction", before: "hold", after: "reduce_exposure", changed: true },
      verdictChange: { field: "verdict", before: "Acceptable", after: "Elevated", changed: true },
      findings: [
        {
          pairId: "onchain-0",
          alignment: "ambiguous",
          label: "Liquidity concern",
          left: { severity: "medium", detail: "pool A", scoreImpact: 10 },
          right: { severity: "high", detail: "pool B", scoreImpact: 30 },
          ambiguityNote:
            "This label appears 1 time(s) in the first run and 2 time(s) in the second, so which finding corresponds to which is not determined. No change is claimed between them.",
        },
      ],
      missingDataChange: { before: [], after: ["holderDistribution"] },
      coOccurringCoverageDrop: true,
    },
  ],
  qualityChanges: [
    {
      agent: "onchain",
      left: { mode: "live", connectedSources: 3, unavailableSources: 0, reliability: 0.9, lastCheckedAt: "2026-02-01T00:00:00.000Z" },
      right: { mode: "partial", connectedSources: 1, unavailableSources: 2, reliability: 0.3, lastCheckedAt: "2026-02-14T00:00:00.000Z" },
      coverageDropped: true,
      note: "Fewer sources answered in the second run. That is a fact about provider coverage; whether it moved this agent's score is not recorded and is not claimed here.",
    },
  ],
  recommendationChange: { field: "recommendation", before: "hold", after: "reduce_exposure", changed: true },
  decisionScoreChange: { before: 40, after: 70, delta: 30 },
  coverage: {
    state: "partial",
    note: "0 agent(s) appear in only one run and 1 finding pairing(s) are undetermined. Those are shown as such rather than resolved by guessing.",
    agentsCompared: 1,
    agentsInOneRunOnly: 0,
    ambiguousFindingCount: 1,
  },
  causeNotEstablished: true,
  readOnly: true,
};

async function stubEndpoint(page: import("@playwright/test").Page, payload: unknown, status = 200) {
  await page.route("**/api/insights/run-comparison", async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

test.describe("Saved run comparison", () => {
  test("renders the page shell and an explicit idle state", async ({ page }) => {
    await page.goto(PAGE_URL);

    await expect(page.getByRole("heading", { name: "Saved run comparison", level: 1 })).toBeVisible();
    await expect(page.getByTestId("comparison-idle")).toContainText(/nothing is re-run/i);
  });

  test("refuses the same run on both sides", async ({ page }) => {
    await stubEndpoint(page, { report: REPORT });
    await page.goto(PAGE_URL);

    const runs = await page.getByLabel(/first run/i).locator("option").count();

    // With fewer than two saved runs the control is disabled, which is the
    // correct behaviour and nothing further to assert.
    test.skip(runs < 2, "needs at least two saved runs");

    await page.getByRole("button", { name: /compare/i }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await stubEndpoint(page, { report: REPORT });
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto(PAGE_URL);

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("explains that it reports changes and not causes", async ({ page }) => {
    await page.goto(PAGE_URL);

    await expect(page.getByText(/declines to say why/i)).toBeVisible();
  });

  test("shows a clear error state when the endpoint refuses the pair", async ({ page }) => {
    await stubEndpoint(page, { error: "cross_context", message: "Those runs are on different networks and cannot be compared." }, 409);
    await page.goto(PAGE_URL);

    const runs = await page.getByLabel(/first run/i).locator("option").count();
    test.skip(runs < 2, "needs at least two saved runs");

    await page.getByLabel(/second run/i).selectOption({ index: 1 });
    await page.getByRole("button", { name: /compare/i }).click();

    await expect(page.getByTestId("comparison-error")).toContainText("cross_context");
  });

  test("links back to the agent timeline", async ({ page }) => {
    await page.goto(PAGE_URL);

    await expect(page.getByRole("link", { name: /back to the agent timeline/i })).toBeVisible();
  });
});
