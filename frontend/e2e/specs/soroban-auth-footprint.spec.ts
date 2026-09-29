import { expect, test } from "../fixtures/test";
import { installMockStellarWallet } from "../fixtures/mockStellarWallet";
import { STELLAR_WALLET } from "../fixtures/tokens";

const simulation = JSON.stringify({
  auth: [
    {
      address: STELLAR_WALLET,
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4",
      functionName: "transfer",
      argumentHash: "abc",
      nonce: "1",
      expirationLedger: 500,
      children: [
        {
          address: STELLAR_WALLET,
          contractId: "CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHBQ",
          functionName: "approve",
          argumentHash: "def",
          nonce: "2",
          expirationLedger: 500,
        },
      ],
    },
  ],
});

test("explains nested soroban auth without signing", async ({ page }) => {
  await installMockStellarWallet(page);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (/submit|execute|sign/.test(new URL(request.url()).pathname)) mutations.push(request.url());
  });
  await page.route("**/api/insights/soroban-auth-footprint", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        walletAddress: STELLAR_WALLET,
        network: "stellar-testnet",
        state: "partial",
        generatedAt: "now",
        decodingIsNotApproval: true,
        nodes: [
          {
            id: "auth-1",
            parentId: null,
            address: STELLAR_WALLET,
            contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4",
            functionName: "transfer",
            argumentHash: "abc",
            nonce: "1",
            expirationLedger: 500,
            networkPassphrase: null,
            depth: 0,
            flags: [],
            note: "Auth entry decoded from simulation fixture.",
          },
          {
            id: "auth-2",
            parentId: "auth-1",
            address: STELLAR_WALLET,
            contractId: "CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHBQ",
            functionName: "approve",
            argumentHash: "def",
            nonce: "2",
            expirationLedger: 500,
            networkPassphrase: null,
            depth: 1,
            flags: [],
            note: "Auth entry decoded from simulation fixture.",
          },
        ],
        warnings: [],
        coverageMessage: "Authorization tree decoded with explicit flags; decoding is not approval.",
      }),
    }),
  );

  await page.goto("/insights/soroban-auth-footprint");
  await page.getByLabel(/Simulation JSON/i).fill(simulation);
  await page.getByRole("button", { name: "Inspect authorization footprint" }).click();
  await expect(page.getByText(/decoding is not approval/i)).toBeVisible();
  await expect(page.getByText(/parent auth-1/i)).toBeVisible();
  const row = page.getByLabel("Soroban authorization nodes").locator("li").first();
  await row.focus();
  await expect(row).toBeFocused();
  expect(mutations).toEqual([]);
});
