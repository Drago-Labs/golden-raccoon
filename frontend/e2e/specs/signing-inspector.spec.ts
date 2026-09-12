import { expect, test } from "@playwright/test";

/**
 * Journey for the signing payload inspector.
 *
 * The endpoint performs no outbound I/O at all, so this journey drives the
 * real page against a stubbed endpoint response. Every address is an obvious
 * placeholder, no key exists, and nothing here could be signed or submitted.
 */
const SPENDER = "0x2222222222222222222222222222222222222222";
const MAX_UINT256 = (2n ** 256n - 1n).toString();

const UNLIMITED_APPROVE = `0x095ea7b3${SPENDER.slice(2).padStart(64, "0")}${"f".repeat(64)}`;

const UNLIMITED_APPROVAL_REPORT = {
  schemaVersion: "signing-inspector/2026-01",
  evaluatedAt: "2026-03-01T12:00:00.000Z",
  payloadKind: "evm_calldata",
  summary: "The calldata calls approve(address,uint256).",
  permissions: [
    {
      permissionId: "evm-approve",
      kind: "token_approval",
      spender: SPENDER,
      recipient: null,
      subject: null,
      amountRaw: MAX_UINT256,
      isUnlimited: true,
      deadline: null,
      rawProvenance: "selector 0x095ea7b3, argument words 0 and 1",
      consequence:
        "Signing and sending this lets the spender move the entire balance of this token, now and at any time in the future, until the approval is revoked.",
    },
  ],
  operations: [],
  unknownFields: [],
  contextBinding: [
    {
      field: "evm_chain_id",
      expected: "1",
      observed: "1",
      state: "match",
      note: "The request names the chain you expect.",
    },
    {
      field: "verifying_contract",
      expected: null,
      observed: null,
      state: "not_bound",
      note: "The caller did not state which contract this calldata would be sent to, so the target was not checked.",
    },
  ],
  coverage: {
    state: "complete",
    note: "Every field in the payload was decoded. That the bytes are readable is not a statement that signing them is safe.",
    decodedFieldCount: 1,
    unknownFieldCount: 0,
  },
  decodingIsNotApproval: true,
  readOnly: true,
};

const UNKNOWN_SELECTOR_REPORT = {
  ...UNLIMITED_APPROVAL_REPORT,
  summary: "The calldata calls an unrecognized function (0xdeadbeef). What it would do is unknown.",
  permissions: [],
  unknownFields: [
    {
      location: "calldata.selector",
      description: "This selector is not on the allowlist. The inspector will not guess what it does.",
      raw: "0xdeadbeef",
    },
  ],
  coverage: {
    state: "unavailable",
    note: "Nothing in the payload could be interpreted. Everything it contains is listed as unrecognized, unchanged.",
    decodedFieldCount: 0,
    unknownFieldCount: 1,
  },
};

async function stubEndpoint(page: import("@playwright/test").Page, payload: unknown, status = 200) {
  await page.route("**/api/insights/signing-inspector", async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  });
}

async function decode(page: import("@playwright/test").Page, payload: string) {
  await page.getByLabel(/unsigned payload/i).fill(payload);
  await page.getByRole("button", { name: /decode/i }).click();
}

test.describe("Signing payload inspector", () => {
  test("renders the page shell and an explicit idle state", async ({ page }) => {
    await page.goto("/insights/signing-inspector");

    await expect(page.getByRole("heading", { name: "Signing payload inspector", level: 1 })).toBeVisible();
    await expect(page.getByTestId("signing-idle")).toContainText(/nothing is signed, submitted or stored/i);
  });

  test("warns against pasting a secret", async ({ page }) => {
    await page.goto("/insights/signing-inspector");

    await expect(page.getByText(/never paste a private key or seed phrase/i)).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await stubEndpoint(page, { report: UNLIMITED_APPROVAL_REPORT });
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/signing-inspector");
    await decode(page, UNLIMITED_APPROVE);

    await expect(page.getByTestId("signing-summary")).toBeVisible();

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("shows an unlimited approval in plain language with its raw provenance", async ({ page }) => {
    await stubEndpoint(page, { report: UNLIMITED_APPROVAL_REPORT });
    await page.goto("/insights/signing-inspector");
    await decode(page, UNLIMITED_APPROVE);

    await expect(page.getByTestId("permission-summary")).toContainText("Unlimited");
    await expect(page.getByTestId("permission-summary")).toContainText(/entire balance/i);
    await expect(page.getByTestId("permission-summary")).toContainText("selector 0x095ea7b3");
  });

  test("always shows that decoding is not approval", async ({ page }) => {
    await stubEndpoint(page, { report: UNLIMITED_APPROVAL_REPORT });
    await page.goto("/insights/signing-inspector");
    await decode(page, UNLIMITED_APPROVE);

    await expect(page.getByTestId("signing-summary")).toContainText(/decoding is not approval/i);
  });

  test("shows an unrecognized selector rather than hiding it", async ({ page }) => {
    await stubEndpoint(page, { report: UNKNOWN_SELECTOR_REPORT });
    await page.goto("/insights/signing-inspector");
    await decode(page, "0xdeadbeef");

    await expect(page.getByTestId("unknown-fields")).toContainText("0xdeadbeef");
    await expect(page.getByTestId("permissions-empty")).toBeVisible();
  });

  test("completes the flow with the keyboard alone", async ({ page }) => {
    await stubEndpoint(page, { report: UNLIMITED_APPROVAL_REPORT });
    await page.goto("/insights/signing-inspector");

    await page.getByLabel(/unsigned payload/i).focus();
    await page.keyboard.type(UNLIMITED_APPROVE);
    await page.getByRole("button", { name: /decode/i }).focus();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("signing-summary")).toBeVisible();
  });

  test("shows a clear error state when the endpoint rejects the payload", async ({ page }) => {
    await stubEndpoint(page, { error: "malformed_envelope", message: "The transaction envelope could not be read as XDR." }, 400);
    await page.goto("/insights/signing-inspector");
    await page.getByLabel(/payload kind/i).selectOption("stellar_envelope");
    await decode(page, "not-xdr");

    await expect(page.getByTestId("signing-error")).toContainText("malformed_envelope");
  });

  test("swaps the expected-context fields when the payload kind changes", async ({ page }) => {
    await page.goto("/insights/signing-inspector");

    await expect(page.getByLabel(/chain id/i)).toBeVisible();

    await page.getByLabel(/payload kind/i).selectOption("stellar_envelope");

    await expect(page.getByLabel(/stellar network/i)).toBeVisible();
    await expect(page.getByLabel(/chain id/i)).toHaveCount(0);
  });
});
