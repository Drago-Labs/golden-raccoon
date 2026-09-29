import { expect, test } from "@playwright/test";

/**
 * Journey for the vesting / unlock workbench.
 *
 * The endpoint reads supported contracts or published schedules, so the journey
 * replaces it with a canned report. No claim, signing, or funds are involved.
 */
const REPORT = {
  schemaVersion: "vesting-unlock/2026-01",
  network: "ethereum",
  chainFamily: "evm",
  asOf: "2026-03-01T12:00:00.000Z",
  displayTimeZone: "UTC",
  observation: {
    ledger: 100,
    closeTime: "2026-03-01T11:59:00.000Z",
    source: "fixture://vesting",
    stale: false,
  },
  tranches: [
    {
      trancheId: "issuer-team-allocation:r2:t0",
      scheduleId: "issuer-team-allocation",
      revision: 2,
      asset: {
        identity: "ethereum:0xtoken0000000000000000000000000000000001",
        symbol: "RAC",
        network: "ethereum",
        chainFamily: "evm",
        decimals: 18,
      },
      beneficiary: "0xabcabcabcabcabcabcabcabcabcabcabcabcabca",
      amountBaseUnits: "500000000000000000",
      unlockAt: "2026-01-01T00:00:00.000Z",
      unlockLedger: null,
      state: "released",
      sourceType: "published_only",
      supersededBy: null,
      provenance: "issuer blog schedule",
      evidenceUrl: "https://example.test/evidence/published",
      unknownReason: null,
    },
    {
      trancheId: "0xvesting-cliff:r1:t0",
      scheduleId: "0xvesting-cliff",
      revision: 1,
      asset: {
        identity: "ethereum:0xtoken0000000000000000000000000000000001",
        symbol: "RAC",
        network: "ethereum",
        chainFamily: "evm",
        decimals: 18,
      },
      beneficiary: "0xabcabcabcabcabcabcabcabcabcabcabcabcabca",
      amountBaseUnits: "1000000000000000000",
      unlockAt: "2026-06-01T00:00:00.000Z",
      unlockLedger: null,
      state: "scheduled",
      sourceType: "onchain_enforced",
      supersededBy: null,
      provenance: "fixture cliff contract",
      evidenceUrl: "https://example.test/evidence/cliff",
      unknownReason: null,
    },
  ],
  timeline: [
    {
      startsAt: "2026-01-01T00:00:00.000Z",
      trancheCount: 1,
      byAsset: [
        {
          asset: {
            identity: "ethereum:0xtoken0000000000000000000000000000000001",
            symbol: "RAC",
            network: "ethereum",
            chainFamily: "evm",
            decimals: 18,
          },
          scheduledBaseUnits: "0",
          releasedBaseUnits: "500000000000000000",
          claimableBaseUnits: "0",
          cancelledBaseUnits: "0",
        },
      ],
    },
  ],
  gaps: [],
  coverage: {
    state: "complete",
    note: "Every supplied source produced dated unlock evidence within the read budget.",
    sourceCount: 2,
    trancheCount: 2,
    countedFutureBaseUnits: "1000000000000000000",
    cancelledFutureBaseUnits: "0",
    gapCount: 0,
    readsUsed: 2,
    readBudget: 100,
    staleObservation: false,
  },
  warnings: [],
  readOnly: true,
  claimAndScheduleUnchanged: true,
};

async function stubEndpoint(page: import("@playwright/test").Page, payload: unknown, status = 200) {
  await page.route("**/api/insights/vesting-unlock", async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

const PAGE_URL = "/insights/vesting-unlock?network=ethereum&chainFamily=evm";

test.describe("Vesting and unlock workbench", () => {
  test("renders the page shell and an explicit idle state", async ({ page }) => {
    await page.goto(PAGE_URL);

    await expect(page.getByRole("heading", { name: "Vesting and unlock schedules", level: 1 })).toBeVisible();
    await expect(page.getByTestId("vesting-idle")).toContainText(/read-only|never claims|no claim/i);
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await stubEndpoint(page, { report: REPORT });
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto(PAGE_URL);
    await page.getByRole("button", { name: /analyse vesting unlocks/i }).click();

    await expect(page.getByTestId("vesting-summary")).toBeVisible();

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("shows distinct published-only and onchain-enforced labels", async ({ page }) => {
    await stubEndpoint(page, { report: REPORT });
    await page.goto(PAGE_URL);
    await page.getByRole("button", { name: /analyse vesting unlocks/i }).click();

    await expect(page.getByTestId("tranche-table")).toContainText(/published-only/i);
    await expect(page.getByTestId("tranche-table")).toContainText(/onchain-enforced/i);
  });

  test("completes the flow with the keyboard alone", async ({ page }) => {
    await stubEndpoint(page, { report: REPORT });
    await page.goto(PAGE_URL);

    await page.getByLabel("Source id").focus();
    await page.getByRole("button", { name: /analyse vesting unlocks/i }).focus();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("vesting-summary")).toBeVisible();
  });

  test("shows a clear error state when the endpoint fails", async ({ page }) => {
    await stubEndpoint(page, { error: "vesting_unlock_failed", message: "The provider did not respond." }, 500);
    await page.goto(PAGE_URL);
    await page.getByRole("button", { name: /analyse vesting unlocks/i }).click();

    await expect(page.getByTestId("vesting-error")).toContainText("vesting_unlock_failed");
  });

  test("never exposes a claim or schedule action", async ({ page }) => {
    const mutations: string[] = [];
    page.on("request", (request) => {
      if (/claim|submit|schedule-tx|execute/i.test(new URL(request.url()).pathname)) {
        mutations.push(request.url());
      }
    });

    await stubEndpoint(page, { report: REPORT });
    await page.goto(PAGE_URL);
    await page.getByRole("button", { name: /analyse vesting unlocks/i }).click();
    await expect(page.getByTestId("vesting-summary")).toBeVisible();
    await expect(page.getByRole("button", { name: /claim/i })).toHaveCount(0);
    expect(mutations).toEqual([]);
  });
});
