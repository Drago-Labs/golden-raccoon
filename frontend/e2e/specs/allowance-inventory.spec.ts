import { expect, test } from "../fixtures/test";
import { installMockEvmWallet, mockEvmWalletSession } from "../fixtures/mockEvmWallet";
import { EVM_WALLET } from "../fixtures/tokens";

const token = "0x3333333333333333333333333333333333333333";
const spender = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test.describe("Allowance inventory", () => {
  test("shows bounded current exposure without transaction actions", async ({ page }) => {
    await installMockEvmWallet(page);
    await mockEvmWalletSession(page);
    const mutationRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/(execute|recovery)\//.test(request.url())) mutationRequests.push(request.url());
    });
    await page.route("**/api/insights/allowance-inventory", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          walletAddress: EVM_WALLET.toLowerCase(), network: "ethereum", generatedAt: "2026-01-01T00:00:00Z", state: "partial",
          entries: [{ token, spender, allowance: "0", allowanceKind: "revoked", symbol: "OLD", decimals: 6, balance: "5000000", knownBalanceExposure: "0", source: "logs", warnings: [] }],
          spenderGroups: [{ spender, activeCount: 0, revokedCount: 1, entries: [{ token, spender, allowance: "0", allowanceKind: "revoked", symbol: "OLD", decimals: 6, balance: "5000000", knownBalanceExposure: "0", source: "logs", warnings: [] }] }],
          coverage: { state: "partial", fromBlock: "0", toBlock: "1000", snapshotBlock: "1000", candidateCount: 1, successfulReads: 1, skippedCalls: 0, logCoverageComplete: false, reorgDetected: false, providerLimitations: ["Approval log discovery was provider-limited"], unsupportedStandards: [], message: "Results are usable but incomplete. Do not treat this inventory as an all-clear." },
        }),
      });
    });

    await page.goto("/insights/allowance-inventory");
    await expect(page.getByRole("heading", { name: "Token allowance inventory" })).toBeVisible();
    await page.getByLabel("From block").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("To block")).toBeFocused();
    await page.getByRole("button", { name: "Build read-only inventory" }).click();
    await expect(page.getByText("Results are usable but incomplete.", { exact: false })).toBeVisible();
    await expect(page.getByText("revoked", { exact: true })).toBeVisible();
    await expect(page.getByText("0 OLD")).toBeVisible();
    await expect(page.getByRole("link", { name: "Review recovery options" })).toHaveAttribute("href", "/recovery");
    await page.getByLabel("Network").selectOption("base");
    await expect(page.getByText("Results are usable but incomplete.", { exact: false })).toHaveCount(0);
    expect(mutationRequests).toEqual([]);
  });
});
