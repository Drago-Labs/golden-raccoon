import { expect, test } from "../fixtures/test";
import { installMockStellarWallet } from "../fixtures/mockStellarWallet";
import { STELLAR_WALLET } from "../fixtures/tokens";

const issuerA = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const issuerB = "GBTNDGT62HU2NIRQY3UVKDV4Q2YLBZILKMEOX6QEDMASBVDX5PVMUWYK";

test("explains path routes without payment submission", async ({ page }) => {
  await installMockStellarWallet(page);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (/submit|execute|sign/.test(new URL(request.url()).pathname)) mutations.push(request.url());
  });
  await page.route("**/api/insights/path-payment", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        walletAddress: STELLAR_WALLET,
        network: "stellar-testnet",
        mode: "strict_send",
        state: "partial",
        generatedAt: "now",
        observation: { ledger: 300, closeTime: "2026-01-03T00:00:00Z", source: "horizon.example", quoteAgeSeconds: 5 },
        sourceAssetKey: "native",
        destinationAssetKey: `classic:USD:${issuerA}`,
        routes: [
          {
            id: "route-1",
            hops: [
              {
                index: 0,
                fromAssetKey: "native",
                toAssetKey: `classic:USD:${issuerB}`,
                inputAmount: "1.0000000",
                outputAmount: "—",
                venue: "orderbook",
                note: "hop",
              },
              {
                index: 1,
                fromAssetKey: `classic:USD:${issuerB}`,
                toAssetKey: `classic:USD:${issuerA}`,
                inputAmount: "—",
                outputAmount: "2.5000000",
                venue: "pool",
                note: "hop",
              },
            ],
            sourceAmount: "1.0000000",
            destinationAmount: "2.5000000",
            estimated: true,
            simulated: false,
            failure: "incomplete_simulation",
            warnings: ["Estimate only"],
          },
        ],
        primaryFailure: "incomplete_simulation",
        coverageMessage: "Path estimates available with explicit freshness/simulation limits.",
        warnings: ["Routes are estimates without a completed simulation."],
      }),
    }),
  );

  await page.goto("/insights/path-payment");
  await page.getByLabel(/Destination asset/i).fill(`USD:${issuerA}`);
  await page.getByRole("button", { name: "Inspect path routes" }).click();
  await expect(page.getByText(/Path estimates available/i)).toBeVisible();
  const row = page.getByLabel("Path payment routes").locator("li").first();
  await row.focus();
  await expect(row).toBeFocused();
  expect(mutations).toEqual([]);
});
