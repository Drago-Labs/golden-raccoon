import { expect, test } from "../fixtures/test";
import { installMockStellarWallet } from "../fixtures/mockStellarWallet";
import { STELLAR_WALLET } from "../fixtures/tokens";

const coSigner = "GBTNDGT62HU2NIRQY3UVKDV4Q2YLBZILKMEOX6QEDMASBVDX5PVMUWYK";

test("explains signer thresholds without signing", async ({ page }) => {
  await installMockStellarWallet(page);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (/submit|execute|sign/.test(new URL(request.url()).pathname)) mutations.push(request.url());
  });
  await page.route("**/api/insights/account-signers", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        walletAddress: STELLAR_WALLET,
        accountAddress: STELLAR_WALLET,
        network: "stellar-testnet",
        state: "partial",
        generatedAt: "now",
        observation: { ledger: 200, closeTime: "2026-01-02T00:00:00Z", source: "horizon.example" },
        thresholds: { low: 1, medium: 2, high: 3, masterWeight: 0 },
        signers: [
          { key: STELLAR_WALLET, weight: 0, kind: "ed25519", sponsor: null },
          { key: coSigner, weight: 2, kind: "ed25519", sponsor: coSigner },
        ],
        totalWeight: 2,
        operations: [
          {
            operation: "payment",
            band: "medium",
            requiredWeight: 2,
            reachable: true,
            note: "Observed signer weights (2) meet the medium threshold (2). This does not prove key possession.",
          },
        ],
        sorobanAuthorization: {
          state: "unsupported",
          note: "Soroban contract authorization is contract-specific and is not modeled as classic threshold reachability.",
        },
        warnings: ["Master key weight is zero; authorization depends on additional signers."],
        coverageMessage: "Signer policy observed with explicit caveats; reachability is not key possession.",
      }),
    }),
  );

  await page.goto("/insights/account-signers");
  await page.getByRole("button", { name: "Inspect signer policy" }).click();
  await expect(page.getByText(/reachability is not key possession/i)).toBeVisible();
  await expect(page.getByText("reachable")).toBeVisible();
  const row = page.getByLabel("Account signers").locator("tbody tr").first();
  await row.focus();
  await expect(row).toBeFocused();
  expect(mutations).toEqual([]);
});
