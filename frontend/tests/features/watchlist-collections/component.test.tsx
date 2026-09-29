import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectionWorkspace } from "@/components/research/watchlist-collections/CollectionWorkspace";
import { createMemoryCollectionsRepository } from "@/server/research/watchlist-collections/memoryRepository";
import { CollectionsError } from "@/server/research/watchlist-collections/schema";
import { runCollectionsCommand } from "@/server/research/watchlist-collections/service";
import { ENTRY_ONE, ENTRY_THREE, ENTRY_TWO, WALLET_A, WALLET_B } from "./fixtures";

/**
 * The workspace posts commands; the stub runs the real service over a fresh
 * memory repository, so the component is exercised against the same contract
 * the endpoint returns — including its ownership behaviour.
 */
function installServiceFetch(options: { entries?: string[]; delayMs?: number } = {}) {
  const repository = createMemoryCollectionsRepository();
  let counter = 0;
  let entries = options.entries ?? [ENTRY_ONE, ENTRY_TWO, ENTRY_THREE];

  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const result = await runCollectionsCommand(JSON.parse(String(init?.body ?? "{}")), {
        repository,
        now: () => new Date(Date.parse("2026-03-01T12:00:00.000Z") + counter * 1000).toISOString(),
        newId: (kind) => {
          counter += 1;
          return `${kind}-${counter}`;
        },
        listWatchlistEntryIds: () => entries,
      });

      return { ok: true, status: 200, json: async () => result } as unknown as Response;
    } catch (error) {
      const failure = error as CollectionsError;

      return {
        ok: false,
        status: failure.status ?? 400,
        json: async () => ({ error: failure.code ?? "collections_command_failed", message: failure.message }),
      } as unknown as Response;
    }
  });

  return { fetchMock, setEntries: (next: string[]) => { entries = next; } };
}

function createCollection(name: string) {
  fireEvent.change(screen.getByLabelText(/new collection/i), { target: { value: name } });
  fireEvent.submit(screen.getByRole("form", { name: /create collection/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CollectionWorkspace", () => {
  it("shows an explicit empty state for a wallet with no collections", async () => {
    vi.stubGlobal("fetch", installServiceFetch().fetchMock);
    render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE]} />);

    expect(await screen.findByTestId("collections-empty")).toBeTruthy();
    expect(screen.getByTestId("collections-summary").textContent).toMatch(/no collections on this network yet/i);
  });

  it("states that deleting a collection never removes a watched asset", async () => {
    vi.stubGlobal("fetch", installServiceFetch().fetchMock);
    render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE]} />);

    const summary = await screen.findByTestId("collections-summary");
    expect(within(summary).getByText(/never the watched asset/i)).toBeTruthy();
  });

  it("creates a collection and lists it", async () => {
    vi.stubGlobal("fetch", installServiceFetch().fetchMock);
    render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE]} />);

    await screen.findByTestId("collections-empty");
    createCollection("Blue chips");

    const sidebar = await screen.findByTestId("collection-sidebar");
    expect(within(sidebar).getByText("Blue chips")).toBeTruthy();
  });

  it("adds a watched asset to the selected collection", async () => {
    vi.stubGlobal("fetch", installServiceFetch().fetchMock);
    render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE, ENTRY_TWO]} />);

    await screen.findByTestId("collections-empty");
    createCollection("Blue chips");
    await screen.findByTestId("collection-sidebar");

    fireEvent.submit(screen.getByRole("form", { name: /add asset/i }));

    const table = await screen.findByTestId("membership-table");
    expect(within(table).getByText(ENTRY_ONE)).toBeTruthy();
  });

  it("reorders memberships from the keyboard-reachable buttons", async () => {
    vi.stubGlobal("fetch", installServiceFetch().fetchMock);
    render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE, ENTRY_TWO]} />);

    await screen.findByTestId("collections-empty");
    createCollection("Blue chips");
    await screen.findByTestId("collection-sidebar");

    fireEvent.submit(screen.getByRole("form", { name: /add asset/i }));
    await screen.findByTestId("membership-table");

    fireEvent.change(screen.getByLabelText(/add a watched asset/i), { target: { value: ENTRY_TWO } });
    fireEvent.submit(screen.getByRole("form", { name: /add asset/i }));

    await waitFor(() => {
      expect(within(screen.getByTestId("membership-table")).getByText(ENTRY_TWO)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Move ${ENTRY_TWO} up`) }));

    await waitFor(() => {
      const rows = within(screen.getByTestId("membership-table")).getAllByRole("row").slice(1);
      expect(rows[0].textContent).toContain(ENTRY_TWO);
    });
  });

  it("shows a membership whose watchlist entry has gone, instead of hiding it", async () => {
    const harness = installServiceFetch();
    vi.stubGlobal("fetch", harness.fetchMock);
    render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE]} />);

    await screen.findByTestId("collections-empty");
    createCollection("Blue chips");
    await screen.findByTestId("collection-sidebar");

    fireEvent.submit(screen.getByRole("form", { name: /add asset/i }));
    await screen.findByTestId("membership-table");

    harness.setEntries([ENTRY_TWO]);
    fireEvent.change(screen.getByLabelText(/new collection/i), { target: { value: "Trigger reload" } });
    fireEvent.submit(screen.getByRole("form", { name: /create collection/i }));

    await waitFor(() => {
      expect(within(screen.getByTestId("membership-table")).getByText(/no longer watched/i)).toBeTruthy();
    });
  });

  it("normalizes tag labels and says so", async () => {
    vi.stubGlobal("fetch", installServiceFetch().fetchMock);
    render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE]} />);

    await screen.findByTestId("collections-empty");

    expect(screen.getByText(/“DeFi” and “defi” are the same tag/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/new tag/i), { target: { value: "DeFi" } });
    fireEvent.submit(screen.getByRole("form", { name: /create tag/i }));

    await screen.findByTestId("tag-list");

    fireEvent.change(screen.getByLabelText(/new tag/i), { target: { value: "  defi " } });
    fireEvent.submit(screen.getByRole("form", { name: /create tag/i }));

    await waitFor(() => {
      expect(within(screen.getByTestId("tag-list")).getAllByRole("listitem")).toHaveLength(1);
    });
    expect(within(screen.getByTestId("tag-list")).getByText("DeFi")).toBeTruthy();
  });

  it("saves a named view over the wallet's own collections", async () => {
    vi.stubGlobal("fetch", installServiceFetch().fetchMock);
    render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE]} />);

    await screen.findByTestId("collections-empty");
    createCollection("Blue chips");
    await screen.findByTestId("collection-sidebar");

    fireEvent.change(screen.getByLabelText(/view name/i), { target: { value: "My view" } });
    fireEvent.submit(screen.getByRole("form", { name: /save view/i }));

    const views = await screen.findByTestId("saved-view-list");
    expect(within(views).getByText("My view")).toBeTruthy();
  });

  it("discards one wallet's collections when the account changes", async () => {
    vi.stubGlobal("fetch", installServiceFetch().fetchMock);
    const view = render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE]} />);

    await screen.findByTestId("collections-empty");
    createCollection("Private");
    await screen.findByTestId("collection-sidebar");

    view.rerender(<CollectionWorkspace account={WALLET_B} network="ethereum" availableEntryIds={[ENTRY_ONE]} />);

    await waitFor(() => {
      expect(screen.queryByTestId("collection-sidebar")).toBeNull();
    });
    expect(screen.getByTestId("collections-empty")).toBeTruthy();
  });

  it("discards them when the network changes", async () => {
    vi.stubGlobal("fetch", installServiceFetch().fetchMock);
    const view = render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE]} />);

    await screen.findByTestId("collections-empty");
    createCollection("On Ethereum");
    await screen.findByTestId("collection-sidebar");

    view.rerender(<CollectionWorkspace account={WALLET_A} network="base" availableEntryIds={[ENTRY_ONE]} />);

    await waitFor(() => {
      expect(screen.queryByTestId("collection-sidebar")).toBeNull();
    });
  });

  it("refuses to act with no wallet connected", async () => {
    const harness = installServiceFetch();
    vi.stubGlobal("fetch", harness.fetchMock);
    render(<CollectionWorkspace account={null} network="ethereum" availableEntryIds={[]} />);

    const error = await screen.findByTestId("collections-error");
    expect(within(error).getByText(/connect a wallet/i)).toBeTruthy();
    expect(harness.fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a transport failure", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    render(<CollectionWorkspace account={WALLET_A} network="ethereum" availableEntryIds={[ENTRY_ONE]} />);

    const error = await screen.findByTestId("collections-error");
    expect(within(error).getByText(/network_error/)).toBeTruthy();
  });
});
