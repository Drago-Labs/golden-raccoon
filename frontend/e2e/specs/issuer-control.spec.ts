import { expect, test } from "../fixtures/test";
import { installMockStellarWallet } from "../fixtures/mockStellarWallet";
import { STELLAR_WALLET } from "../fixtures/tokens";

const issuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

test("explains issuer controls and trustline state without signing", async ({ page }) => {
  await installMockStellarWallet(page);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (/submit|execute|sign/.test(new URL(request.url()).pathname)) mutations.push(request.url());
  });
  await page.route("**/api/insights/issuer-control", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        walletAddress: STELLAR_WALLET,
        accountAddress: STELLAR_WALLET,
        network: "stellar-testnet",
        state: "partial",
        generatedAt: "now",
        asset: {
          kind: "classic",
          assetKey: `classic:USD:${issuer}`,
          display: `USD:${issuer}`,
          code: "USD",
          issuer,
          contractId: null,
          network: "stellar-testnet",
        },
        observation: { ledger: 100, closeTime: "2026-01-01T00:00:00Z", source: "horizon.example" },
        issuerFlags: {
          state: "observed",
          authRequired: true,
          authRevocable: true,
          authImmutable: false,
          authClawbackEnabled: true,
          issuerExists: true,
          issuer,
          ledger: 100,
          observedAt: "2026-01-01T00:00:00Z",
          source: "horizon.example",
          note: "Issuer control flags recorded at the observed ledger.",
        },
        trustline: {
          state: "fully_authorized",
          balance: "10.0000000",
          limit: "1000.0000000",
          buyingLiabilities: "0",
          sellingLiabilities: "0",
          account: STELLAR_WALLET,
          assetKey: `classic:USD:${issuer}`,
          ledger: 100,
          observedAt: "2026-01-01T00:00:00Z",
          source: "horizon.example",
          note: "Trustline is fully authorized at the observed ledger.",
        },
        events: [
          {
            id: "effect-1",
            kind: "trustline_clawed_back",
            pagingToken: "1",
            account: STELLAR_WALLET,
            assetKey: `classic:USD:${issuer}`,
            amount: "1.0000000",
            ledger: 99,
            closedAt: "2025-12-31T00:00:00Z",
            source: "horizon.example",
            note: "Observed trustline clawed back effect.",
          },
        ],
        coverage: {
          pagesRead: 1,
          recordsRead: 1,
          duplicatePage: false,
          truncated: true,
          message: "Issuer-control evidence is incomplete or partially unavailable.",
        },
        warnings: ["Event pagination limit reached; timeline is incomplete."],
      }),
    }),
  );

  await page.goto("/insights/issuer-control");
  await page.getByLabel(/Asset/i).fill(`USD:${issuer}`);
  await page.getByRole("button", { name: "Inspect issuer controls" }).click();
  await expect(page.getByText("Issuer-control evidence is incomplete or partially unavailable.")).toBeVisible();
  await expect(page.getByText("fully_authorized")).toBeVisible();
  await expect(page.getByText(/trustline clawed back/i)).toBeVisible();
  const row = page.getByLabel("Issuer control events").locator("li").first();
  await row.focus();
  await expect(row).toBeFocused();
  expect(mutations).toEqual([]);
});
