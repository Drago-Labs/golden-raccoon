import { expect, test } from "../fixtures/test";

const wallet = "0x1111111111111111111111111111111111111111";
const contract = "0xcccccccccccccccccccccccccccccccccccccccc";

test("traces authority history without a mutating request", async ({ page }) => {
  await page.addInitScript(
    ({ address }) => {
      window.__GR_E2E_WALLET__ = { family: "evm", address, chainId: 1, chainName: "Ethereum" };
    },
    { address: wallet },
  );

  const mutations: string[] = [];
  page.on("request", (request) => {
    if (/grant|revoke|upgrade|admin-change|submit/i.test(request.url())) mutations.push(request.url());
  });

  await page.route("**/api/insights/authority-history", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        report: {
          schemaVersion: "authority-history/2026-01",
          walletAddress: wallet,
          network: "ethereum",
          contractAddress: contract,
          generatedAt: "2026-01-01T00:00:00Z",
          events: [
            {
              kind: "OwnershipTransferred",
              family: "application",
              network: "ethereum",
              contractAddress: contract,
              blockNumber: "100",
              blockHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
              logIndex: 0,
              transactionUrl: "https://etherscan.io/tx/0x1111111111111111111111111111111111111111111111111111111111111111",
              previousOwner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              newOwner: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              roleId: null,
              account: null,
              sender: null,
              previousAdminRole: null,
              newAdminRole: null,
              previousAdmin: null,
              newAdmin: null,
            },
          ],
          timeline: [
            {
              kind: "OwnershipTransferred",
              family: "application",
              network: "ethereum",
              contractAddress: contract,
              blockNumber: "100",
              blockHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
              logIndex: 0,
              transactionUrl: "https://etherscan.io/tx/0x1111111111111111111111111111111111111111111111111111111111111111",
              previousOwner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              newOwner: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              roleId: null,
              account: null,
              sender: null,
              previousAdminRole: null,
              newAdminRole: null,
              previousAdmin: null,
              newAdmin: null,
            },
          ],
          roleMatrix: [],
          roleAdmins: [],
          observedOwners: [
            {
              address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              family: "application",
              reconstructed: true,
              evidenceEventIndex: 0,
            },
          ],
          coverage: {
            state: "complete",
            fromBlock: "0",
            toBlock: "1000",
            snapshotBlock: "1000",
            eventCount: 1,
            truncated: false,
            logCoverageComplete: true,
            reorgDetected: false,
            missingBlockHashes: 0,
            unsupportedModels: [],
            providerLimitations: [],
            reconstructionValid: true,
            message: "Every block in the requested range was readable and hashes still match.",
          },
          readOnly: true,
          authorityUnchanged: true,
        },
      }),
    }),
  );

  await page.goto("/insights/authority-history");
  await page.getByLabel("Network").selectOption("ethereum");
  await page.getByLabel("Contract address").fill(contract);
  await page.getByRole("button", { name: "Trace authority history" }).click();
  await expect(page.getByText("OwnershipTransferred")).toBeVisible();
  await expect(page.getByText(/Coverage range/i)).toBeVisible();
  expect(mutations).toEqual([]);
});
