import { Address, StrKey, xdr } from "@stellar/stellar-sdk";
import { expect, test } from "../fixtures/test";
import { installMockStellarWallet } from "../fixtures/mockStellarWallet";

const contractId = StrKey.encodeContract(Buffer.alloc(32, 7));
const ledgerKey = xdr.LedgerKey.contractData(
  new xdr.LedgerKeyContractData({
    contract: Address.fromString(contractId).toScAddress(),
    key: xdr.ScVal.scvLedgerKeyContractInstance(),
    durability: xdr.ContractDataDurability.persistent,
  }),
).toXdr("base64");

test.describe("storage lifetime diagnostics", () => {
  test("shows bounded read-only evidence on desktop and mobile", async ({ page }) => {
    await installMockStellarWallet(page);
    const mutatingRequests: string[] = [];
    page.on("request", (request) => {
      if (/restore|extend|submit/i.test(request.url())) mutatingRequests.push(request.url());
    });
    await page.route("**/api/insights/storage-lifetime", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          contractId,
          network: "stellar-testnet",
          state: "partial",
          observedLedger: 1_000,
          source: "rpc.test",
          coverage: { requested: 2, returned: 1, missing: 1, message: "Some RPC entries are missing; archival is not inferred." },
          warnings: [],
          entries: [
            { keyXdr: ledgerKey, kind: "instance", durability: "persistent", state: "live", liveUntilLedger: 1_020, remainingLedgers: 20, estimatedSecondsRemaining: 100, evidence: ["Persistent entry"] },
            { keyXdr: ledgerKey + "A", kind: "data", durability: "temporary", state: "missing", liveUntilLedger: null, remainingLedgers: null, estimatedSecondsRemaining: null, evidence: ["Absence does not prove archival"] },
          ],
        }),
      });
    });

    await page.goto("/insights/storage-lifetime");
    await page.getByLabel("Contract ID").fill(contractId);
    await page.getByLabel(/Ledger-key XDR/).fill(ledgerKey);
    await page.getByRole("button", { name: "Inspect storage lifetime" }).click();

    await expect(page.getByText("Observed ledger 1000")).toBeVisible();
    await expect(page.getByText("instance · persistent")).toBeVisible();
    await expect(page.getByText("data · temporary")).toBeVisible();
    expect(mutatingRequests).toEqual([]);
  });
});
