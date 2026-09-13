import { expect, test } from "@playwright/test";

/**
 * Journey for the proxy implementation inspector.
 *
 * The endpoint's only outbound I/O is a JSON-RPC read, so the journey replaces
 * the endpoint with a canned report. Every address below is an obvious
 * placeholder; no real contract is read and no chain is contacted.
 */
const PROXY = "0x1111111111111111111111111111111111111111";
const IMPLEMENTATION = "0x2222222222222222222222222222222222222222";
const ADMIN = "0x3333333333333333333333333333333333333333";

const SLOT_IMPLEMENTATION = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const SLOT_ADMIN = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

function scoped(address: string) {
  return { network: "ethereum", chainId: 1, address };
}

const DIRECT_PROXY_REPORT = {
  schemaVersion: "proxy-inspector/2026-01",
  checkedAtBlock: "0x1312d00",
  checkedAtBlockNumber: 20_000_000,
  network: "ethereum",
  chainId: 1,
  target: scoped(PROXY),
  classification: "erc1967_direct_proxy",
  summary: "The contract holds an implementation address in the ERC-1967 slot and delegates to it.",
  targetCode: { target: scoped(PROXY), hasCode: true, codeSizeBytes: 45, codePreview: "0x363d3d37", unavailableReason: null },
  slots: [
    {
      slotKey: "erc1967Implementation",
      slot: SLOT_IMPLEMENTATION,
      label: "ERC-1967 implementation slot",
      standard: "ERC-1967",
      rawValue: `0x${IMPLEMENTATION.slice(2).padStart(64, "0")}`,
      decodedAddress: IMPLEMENTATION,
      isZero: false,
      isDirty: false,
      unavailableReason: null,
    },
    {
      slotKey: "erc1967Admin",
      slot: SLOT_ADMIN,
      label: "ERC-1967 admin slot",
      standard: "ERC-1967",
      rawValue: `0x${ADMIN.slice(2).padStart(64, "0")}`,
      decodedAddress: ADMIN,
      isZero: false,
      isDirty: false,
      unavailableReason: null,
    },
  ],
  path: [
    {
      depth: 1,
      from: scoped(PROXY),
      to: scoped(IMPLEMENTATION),
      kind: "erc1967_direct",
      evidence: `ERC-1967 implementation slot (${SLOT_IMPLEMENTATION}) held a non-zero address.`,
      code: { target: scoped(IMPLEMENTATION), hasCode: true, codeSizeBytes: 8, codePreview: "0x6080", unavailableReason: null },
    },
  ],
  authority: [
    {
      kind: "observed_admin_slot",
      holder: scoped(ADMIN),
      holderHasCode: true,
      evidence: `ERC-1967 admin slot (${SLOT_ADMIN}) held an address at block 0x1312d00.`,
      limitation: "The admin is a contract. What that contract permits is not readable from this slot.",
    },
  ],
  findings: [],
  coverage: { state: "complete", note: "Every planned read completed at the checked block.", rpcCallsUsed: 9, rpcCallBudget: 48, failedReadCount: 0 },
  readOnly: true,
  scoreUnchanged: true,
};

const NOT_A_CONTRACT_REPORT = {
  ...DIRECT_PROXY_REPORT,
  classification: "not_a_contract",
  summary: "The address held no code at the checked block, so it is an externally owned account.",
  targetCode: { target: scoped(PROXY), hasCode: false, codeSizeBytes: 0, codePreview: "0x", unavailableReason: null },
  slots: [],
  path: [],
  authority: [],
  coverage: { state: "empty", note: "The address holds no code, so there is nothing to inspect.", rpcCallsUsed: 2, rpcCallBudget: 48, failedReadCount: 0 },
};

async function stubEndpoint(page: import("@playwright/test").Page, payload: unknown, status = 200) {
  await page.route("**/api/insights/proxy-inspector", async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

async function inspect(page: import("@playwright/test").Page) {
  await page.getByLabel(/contract address/i).fill(PROXY);
  await page.getByRole("button", { name: /inspect/i }).click();
}

test.describe("Proxy implementation inspector", () => {
  test("renders the page shell and an explicit idle state", async ({ page }) => {
    await page.goto("/insights/proxy-inspector");

    await expect(page.getByRole("heading", { name: "Proxy implementation inspector", level: 1 })).toBeVisible();
    await expect(page.getByTestId("inspector-idle")).toContainText(/no signature is requested/i);
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await stubEndpoint(page, { report: DIRECT_PROXY_REPORT });
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/proxy-inspector");
    await inspect(page);

    await expect(page.getByTestId("inspector-summary")).toBeVisible();

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("shows the implementation path and its slot evidence", async ({ page }) => {
    await stubEndpoint(page, { report: DIRECT_PROXY_REPORT });
    await page.goto("/insights/proxy-inspector");
    await inspect(page);

    await expect(page.getByTestId("inspector-summary")).toContainText("ERC-1967 proxy");
    await expect(page.getByTestId("implementation-graph")).toContainText(IMPLEMENTATION);
    await expect(page.getByTestId("proxy-evidence")).toContainText(SLOT_IMPLEMENTATION);
  });

  test("shows observed authority next to what it does not establish", async ({ page }) => {
    await stubEndpoint(page, { report: DIRECT_PROXY_REPORT });
    await page.goto("/insights/proxy-inspector");
    await inspect(page);

    await expect(page.getByTestId("authority-table")).toContainText(ADMIN);
    await expect(page.getByTestId("authority-table")).toContainText(/not readable from this slot/i);
  });

  test("completes the flow with the keyboard alone", async ({ page }) => {
    await stubEndpoint(page, { report: DIRECT_PROXY_REPORT });
    await page.goto("/insights/proxy-inspector");

    await page.getByLabel(/contract address/i).focus();
    await page.keyboard.type(PROXY);
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("inspector-summary")).toBeVisible();
  });

  test("distinguishes an empty result from a failure", async ({ page }) => {
    await stubEndpoint(page, { report: NOT_A_CONTRACT_REPORT });
    await page.goto("/insights/proxy-inspector");
    await inspect(page);

    await expect(page.getByTestId("inspector-summary")).toContainText("No contract");
    await expect(page.getByTestId("inspector-error")).toHaveCount(0);
  });

  test("shows a clear error state when the endpoint fails", async ({ page }) => {
    await stubEndpoint(page, { error: "proxy_inspection_failed", message: "The provider did not respond." }, 500);
    await page.goto("/insights/proxy-inspector");
    await inspect(page);

    await expect(page.getByTestId("inspector-error")).toContainText("proxy_inspection_failed");
  });

  test("is reachable from the risk breakdown entry point", async ({ page }) => {
    await page.goto("/insights/proxy-inspector");

    await expect(page.getByRole("link", { name: /back to dashboard/i })).toBeVisible();
  });
});
