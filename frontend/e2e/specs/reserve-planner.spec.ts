import { expect, test } from "../fixtures/test";
import { installMockStellarWallet } from "../fixtures/mockStellarWallet";
import { STELLAR_WALLET } from "../fixtures/tokens";

test("reserve planner explains before and after values without a signing request", async ({ page }) => {
  const mutationRequests: string[] = [];
  await installMockStellarWallet(page);
  page.on("request", (request) => { if (/\/api\/(execute|recovery|stellar\/.*submit)/.test(request.url())) mutationRequests.push(request.url()); });
  await page.route("**/api/insights/reserve-planner", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    walletAddress: STELLAR_WALLET, network: "stellar-testnet", state: "complete", generatedAt: "now",
    observation: { ledger: 900, source: "horizon.example", checkedAt: "now", consistent: true }, baseReserveStroops: "5000000",
    beforeCounters: { subentryCount: 2, numSponsoring: 0, numSponsored: 0 }, afterCounters: { subentryCount: 3, numSponsoring: 0, numSponsored: 0 },
    before: { balanceStroops: "1000000000", baseAccountReserveStroops: "10000000", subentryReserveStroops: "10000000", sponsoringReserveStroops: "0", sponsoredReserveCreditStroops: "0", minimumReserveStroops: "20000000", sellingLiabilitiesStroops: "12500000", feeAllowanceStroops: "100000", spendableStroops: "967400000", shortfallStroops: "0", reconciliationStroops: "0" },
    after: { balanceStroops: "1000000000", baseAccountReserveStroops: "10000000", subentryReserveStroops: "15000000", sponsoringReserveStroops: "0", sponsoredReserveCreditStroops: "0", minimumReserveStroops: "25000000", sellingLiabilitiesStroops: "12500000", feeAllowanceStroops: "100000", spendableStroops: "962400000", shortfallStroops: "0", reconciliationStroops: "0" }, scenario: { action: "add_entry", count: 1 }, warnings: [], unsupportedEntryTypes: [],
  }) }));
  await page.goto("/insights/reserve-planner");
  await expect(page.getByRole("heading", { name: "Reserve and sponsorship planner" })).toBeVisible();
  await page.getByLabel("Scenario").selectOption("add_entry");
  await page.getByRole("button", { name: "Calculate reserve plan" }).click();
  await expect(page.getByText("Before and after obligations")).toBeVisible();
  await expect(page.getByText("Entries sponsored for others")).toBeVisible();
  expect(mutationRequests).toEqual([]);
});
