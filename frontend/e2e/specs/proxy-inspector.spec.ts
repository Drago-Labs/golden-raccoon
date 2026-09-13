import { expect, test } from "../fixtures/test";
const wallet = "0x1111111111111111111111111111111111111111";
const implementation = "0x2222222222222222222222222222222222222222";
test("inspects proxy evidence without a mutating request", async ({ page }) => {
  await page.addInitScript(({ address }) => { window.__GR_E2E_WALLET__ = { family: "evm", address, chainId: 1, chainName: "Ethereum" }; }, { address: wallet });
  const mutations: string[] = []; page.on("request", (request) => { if (/upgrade|submit|admin-change/i.test(request.url())) mutations.push(request.url()); });
  await page.route("**/api/insights/proxy-inspector", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ network: "ethereum", blockNumber: 100, state: "complete", classification: "erc1967_direct", nodes: [{ address: wallet, role: "proxy", code: true }, { address: implementation, role: "implementation", code: true }], edges: [{ from: wallet, to: implementation, kind: "implementation" }], authority: { address: null, conclusion: "Admin slot is empty; UUPS or other upgrade authority remains unknown." }, observations: [{ kind: "slot", address: wallet, detail: "implementation=" + implementation, ok: true }], warnings: [] }) }));
  await page.goto("/insights/proxy-inspector");
  await page.getByLabel("Network").selectOption("ethereum");
  await page.getByLabel("Contract address").fill(wallet);
  await page.getByRole("button", { name: "Inspect proxy" }).click();
  await expect(page.getByText("erc1967_direct")).toBeVisible();
  await expect(page.getByText(/authority remains unknown/)).toBeVisible();
  expect(mutations).toEqual([]);
});
