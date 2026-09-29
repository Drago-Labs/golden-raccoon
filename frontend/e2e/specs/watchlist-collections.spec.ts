import { expect, test } from "@playwright/test";

/**
 * Journey for the collections workspace.
 *
 * The endpoint is replaced with a small in-memory command handler, so the
 * journey covers the page and its interactions without a database. Wallet
 * addresses are obvious placeholders.
 */
const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ENTRY = "entry-1";

const PAGE_URL = `/insights/watchlist-collections?account=${WALLET}&network=ethereum`;

type State = {
  collections: Array<{ id: string; owner: unknown; name: string; description: null; position: number; createdAt: string; updatedAt: string; revision: number }>;
  tags: Array<{ id: string; owner: unknown; label: string; normalized: string; createdAt: string }>;
  memberships: Array<{ id: string; owner: unknown; collectionId: string; watchlistEntryId: string; position: number; tagIds: string[]; addedAt: string; referenceMissing: boolean }>;
  savedViews: unknown[];
};

async function stubEndpoint(page: import("@playwright/test").Page) {
  const owner = { walletAddress: WALLET, network: "ethereum" };
  const now = "2026-03-01T12:00:00.000Z";
  const state: State = { collections: [], tags: [], memberships: [], savedViews: [] };
  let counter = 0;

  await page.route("**/api/insights/watchlist-collections", async (route) => {
    const command = route.request().postDataJSON() as { action: string; collection?: { name: string }; tag?: { label: string }; membership?: { collectionId: string; watchlistEntryId: string }; collectionId?: string };

    counter += 1;

    if (command.action === "create_collection" && command.collection) {
      state.collections.push({
        id: `collection-${counter}`,
        owner,
        name: command.collection.name,
        description: null,
        position: state.collections.length,
        createdAt: now,
        updatedAt: now,
        revision: 1,
      });
    }

    if (command.action === "create_tag" && command.tag) {
      const normalized = command.tag.label.trim().toLowerCase().replace(/\s+/g, " ");

      if (!state.tags.some((tag) => tag.normalized === normalized)) {
        state.tags.push({ id: `tag-${counter}`, owner, label: command.tag.label.trim(), normalized, createdAt: now });
      }
    }

    if (command.action === "add_membership" && command.membership) {
      state.memberships.push({
        id: `membership-${counter}`,
        owner,
        collectionId: command.membership.collectionId,
        watchlistEntryId: command.membership.watchlistEntryId,
        position: state.memberships.length,
        tagIds: [],
        addedAt: now,
        referenceMissing: false,
      });
    }

    if (command.action === "delete_collection") {
      state.collections = state.collections.filter((collection) => collection.id !== command.collectionId);
      state.memberships = state.memberships.filter((membership) => membership.collectionId !== command.collectionId);
    }

    const empty =
      state.collections.length === 0 && state.tags.length === 0 && state.memberships.length === 0 && state.savedViews.length === 0;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "snapshot",
        snapshot: {
          schemaVersion: "watchlist-collections/2026-01",
          owner,
          ...state,
          coverage: empty
            ? { state: "empty", note: "This wallet has no collections on this network yet. That is a successful result, not a failure.", missingReferenceCount: 0 }
            : { state: "complete", note: "Every membership points at a watchlist entry that still exists.", missingReferenceCount: 0 },
          assetsUnchanged: true,
        },
      }),
    });
  });
}

test.describe("Watchlist collections", () => {
  test("renders the page shell and an explicit empty state", async ({ page }) => {
    await stubEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByRole("heading", { name: "Watchlist collections", level: 1 })).toBeVisible();
    await expect(page.getByTestId("collections-empty")).toBeVisible();
  });

  test("states that deleting a collection keeps the watched asset", async ({ page }) => {
    await stubEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByTestId("collections-summary")).toContainText(/never the watched asset/i);
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await stubEndpoint(page);
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto(PAGE_URL);

    await expect(page.getByTestId("collections-summary")).toBeVisible();

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("creates a collection with the keyboard alone", async ({ page }) => {
    await stubEndpoint(page);
    await page.goto(PAGE_URL);

    await page.getByLabel(/new collection/i).focus();
    await page.keyboard.type("Blue chips");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("collection-sidebar")).toContainText("Blue chips");
  });

  test("deletes a collection from its own button", async ({ page }) => {
    await stubEndpoint(page);
    await page.goto(PAGE_URL);

    await page.getByLabel(/new collection/i).fill("Temporary");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByTestId("collection-sidebar")).toContainText("Temporary");

    await page.getByRole("button", { name: /delete the collection temporary/i }).click();

    await expect(page.getByTestId("collections-empty")).toBeVisible();
  });

  test("explains the tag normalization rule up front", async ({ page }) => {
    await stubEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByText(/are the same tag/i)).toBeVisible();
  });

  test("links back to the watchlist", async ({ page }) => {
    await stubEndpoint(page);
    await page.goto(PAGE_URL);

    await expect(page.getByRole("link", { name: /back to the watchlist/i })).toBeVisible();
  });

  test("shows the asset picker for a watched entry", async ({ page }) => {
    await stubEndpoint(page);
    await page.goto(`${PAGE_URL}&entry=${ENTRY}`);

    await page.getByLabel(/new collection/i).fill("Blue chips");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByLabel(/add a watched asset/i)).toBeVisible();
  });
});
