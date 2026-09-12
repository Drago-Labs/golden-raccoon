import { expect, test } from "@playwright/test";

/**
 * Journey for the fee analysis workspace.
 *
 * The endpoint reads storage and chain receipts, so the journey replaces it
 * with a canned report. Every hash and address is an obvious placeholder.
 */
function asset(network: string, symbol: string, kind: "evm_native" | "stellar_native", decimals: number) {
  return { kind, symbol, network, decimals };
}

const REPORT = {
  schemaVersion: "fee-analysis/2026-01",
  walletAddress: "0xabcabcabcabcabcabcabcabcabcabcabcabcabca",
  window: { from: "2026-02-01T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z", bucket: "day" },
  charges: [
    {
      chargeId: "ethereum:0xaaa1",
      hash: "0xaaa1",
      network: "ethereum",
      chainFamily: "evm",
      category: "swap",
      outcome: "succeeded",
      occurredAt: "2026-02-10T10:01:00.000Z",
      asset: asset("ethereum", "ETH", "evm_native", 18),
      amountBaseUnits: "420000000000000",
      evidence: "observed",
      payer: "0xabcabcabcabcabcabcabcabcabcabcabcabcabca",
      feeBumpPayer: null,
      originalSource: null,
      refundBaseUnits: null,
      provenance: "receipt for 0xaaa1: gasUsed 21000 × effectiveGasPrice 20000000000",
      unknownReason: null,
    },
    {
      chargeId: "ethereum:0xbbb1",
      hash: "0xbbb1",
      network: "ethereum",
      chainFamily: "evm",
      category: "transfer",
      outcome: "succeeded",
      occurredAt: "2026-02-18T10:00:00.000Z",
      asset: asset("ethereum", "ETH", "evm_native", 18),
      amountBaseUnits: null,
      evidence: "unknown",
      payer: null,
      feeBumpPayer: null,
      originalSource: null,
      refundBaseUnits: null,
      provenance: "receipt for 0xbbb1",
      unknownReason: "The receipt carried no effectiveGasPrice.",
    },
  ],
  excluded: [
    {
      hash: "0xaaa3",
      reason: "superseded_by_replacement",
      detail: "This transaction was replaced. The charge is attributed to its replacement so one intent is not counted twice.",
      supersededBy: "0xaaa4",
    },
  ],
  byNetwork: [
    {
      network: "ethereum",
      chargeCount: 2,
      byAsset: [
        {
          asset: asset("ethereum", "ETH", "evm_native", 18),
          observedBaseUnits: "420000000000000",
          observedCount: 1,
          unknownCount: 1,
          estimatedCount: 0,
          refundBaseUnits: "0",
          fiat: null,
        },
      ],
    },
  ],
  byCategory: [
    {
      category: "swap",
      chargeCount: 1,
      byAsset: [
        {
          asset: asset("ethereum", "ETH", "evm_native", 18),
          observedBaseUnits: "420000000000000",
          observedCount: 1,
          unknownCount: 0,
          estimatedCount: 0,
          refundBaseUnits: "0",
          fiat: null,
        },
      ],
    },
  ],
  timeline: [
    {
      startsAt: "2026-02-10T00:00:00.000Z",
      chargeCount: 1,
      byAsset: [
        {
          asset: asset("ethereum", "ETH", "evm_native", 18),
          observedBaseUnits: "420000000000000",
          observedCount: 1,
          unknownCount: 0,
          estimatedCount: 0,
          refundBaseUnits: "0",
          fiat: null,
        },
      ],
    },
  ],
  coverage: {
    state: "partial",
    note: "1 of 2 charges were observed. The totals cover only those; the remaining 1 are counted but not valued.",
    recordCount: 3,
    chargeCount: 2,
    observedCount: 1,
    unknownCount: 1,
    excludedCount: 1,
    readsUsed: 2,
    readBudget: 200,
    fiatIncomplete: true,
  },
  fiatUnavailableReason:
    "Some charges in this window could not be read, so converting the observed ones would produce a figure that looks like a complete total.",
  readOnly: true,
  feePolicyUnchanged: true,
};

async function stubEndpoint(page: import("@playwright/test").Page, payload: unknown, status = 200) {
  await page.route("**/api/insights/fee-analysis", async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

const PAGE_URL = "/insights/fee-analysis?account=0xabcabcabcabcabcabcabcabcabcabcabcabcabca";

test.describe("Network fee analysis", () => {
  test("renders the page shell and an explicit idle state", async ({ page }) => {
    await page.goto(PAGE_URL);

    await expect(page.getByRole("heading", { name: "Network fee analysis", level: 1 })).toBeVisible();
    await expect(page.getByTestId("fee-idle")).toContainText(/no fee policy/i);
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await stubEndpoint(page, { report: REPORT });
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto(PAGE_URL);
    await page.getByRole("button", { name: /analyse fees/i }).click();

    await expect(page.getByTestId("fee-summary")).toBeVisible();

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("shows per-asset totals and no single cross-asset figure", async ({ page }) => {
    await stubEndpoint(page, { report: REPORT });
    await page.goto(PAGE_URL);
    await page.getByRole("button", { name: /analyse fees/i }).click();

    await expect(page.getByTestId("fee-by-network")).toContainText("0.00042");
    await expect(page.getByTestId("fiat-unavailable")).toContainText(/looks like a complete total/i);
  });

  test("lists what the totals do not cover", async ({ page }) => {
    await stubEndpoint(page, { report: REPORT });
    await page.goto(PAGE_URL);
    await page.getByRole("button", { name: /analyse fees/i }).click();

    await expect(page.getByTestId("coverage-table")).toContainText("0xbbb1");
    await expect(page.getByTestId("coverage-table")).toContainText(/counted as 0xaaa4/);
  });

  test("completes the flow with the keyboard alone", async ({ page }) => {
    await stubEndpoint(page, { report: REPORT });
    await page.goto(PAGE_URL);

    await page.getByLabel("Period").focus();
    await page.getByRole("button", { name: /analyse fees/i }).focus();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("fee-summary")).toBeVisible();
  });

  test("shows a clear error state when the endpoint fails", async ({ page }) => {
    await stubEndpoint(page, { error: "fee_analysis_failed", message: "The provider did not respond." }, 500);
    await page.goto(PAGE_URL);
    await page.getByRole("button", { name: /analyse fees/i }).click();

    await expect(page.getByTestId("fee-error")).toContainText("fee_analysis_failed");
  });

  test("links back to transaction history", async ({ page }) => {
    await page.goto(PAGE_URL);

    await expect(page.getByRole("link", { name: /back to transaction history/i })).toBeVisible();
  });
});
