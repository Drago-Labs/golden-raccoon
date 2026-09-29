import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpamDustPanel } from "@/components/research/spam-dust-review/SpamDustPanel";
import { SpamDustError } from "@/server/research/spam-dust-review/schema";
import { reviewSpamDust } from "@/server/research/spam-dust-review/service";
import { emptyWallet, highValueUnpriced, spamLikeFixtures } from "./fixtures";

function installServiceFetch() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    try {
      const report = reviewSpamDust(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as SpamDustError;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: failure.code, message: failure.message }),
      } as unknown as Response;
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SpamDustPanel", () => {
  it("shows an empty idle state", () => {
    installServiceFetch();
    render(<SpamDustPanel account="GABC" network="stellar-pubnet" />);
    expect(screen.getByText(/No wallet holdings are loaded/i)).toBeTruthy();
  });

  it("lists spam-like signals and supports keyboard hide/show", async () => {
    const fetchMock = installServiceFetch();
    render(<SpamDustPanel input={spamLikeFixtures} account={spamLikeFixtures.walletId} network="stellar-pubnet" />);

    const table = await screen.findByRole("table", { name: /Spam and dust review/i });
    expect(within(table).getByText(/suspicious link/i)).toBeTruthy();
    expect(within(table).getByText(/tiny value/i)).toBeTruthy();

    const hideButtons = within(table).getAllByRole("button", { name: /^Hide$/i });
    fireEvent.click(hideButtons[0]);

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getByTestId("uncertainty-note").textContent).toMatch(/Hidden assets remain discoverable/i));
  });

  it("does not present unpriced high-value holdings as dust", async () => {
    installServiceFetch();
    render(<SpamDustPanel input={highValueUnpriced} account="GABC" network="stellar-pubnet" />);

    const table = await screen.findByRole("table", { name: /Spam and dust review/i });
    expect(within(table).getAllByText(/unpriced/i).length).toBeGreaterThan(0);
    expect(within(table).queryByText(/tiny value/i)).toBeNull();
    expect(within(table).getByText(/not treated as dust/i)).toBeTruthy();
  });

  it("keeps the portfolio unchanged marker visible", async () => {
    installServiceFetch();
    render(<SpamDustPanel input={spamLikeFixtures} account="GABC" network="stellar-pubnet" />);
    expect(await screen.findByTestId("portfolio-unchanged")).toBeTruthy();
    expect(screen.getByTestId("preference-export").textContent).toMatch(/spam-dust-prefs/);
  });

  it("shows empty coverage", async () => {
    installServiceFetch();
    render(<SpamDustPanel input={emptyWallet} account="GABC" network="stellar-pubnet" />);
    expect((await screen.findByTestId("coverage-note")).textContent).toMatch(/empty/i);
  });

  it("announces failures accessibly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_request", message: "bad" }),
      })),
    );
    render(
      <SpamDustPanel
        input={{ walletId: "x", chainId: "y", generatedAt: "nope", holdings: [] }}
        account="GABC"
        network="stellar-pubnet"
      />,
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
