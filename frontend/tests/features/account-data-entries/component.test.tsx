import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataEntryInspector } from "@/components/research/account-data-entries/DataEntryInspector";
import { inspectDataEntries } from "@/server/research/account-data-entries/service";
import { binaryFixture, deletedFixture, depsFor, requestFor, textFixture, unavailableDeps } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function install(reportPromise: Promise<unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ report: await reportPromise }),
    })),
  );
}

function submit(account: string) {
  fireEvent.change(screen.getByRole("textbox", { name: /^account$/i }), { target: { value: account } });
  fireEvent.submit(screen.getByRole("form", { name: /account data entries/i }));
}

describe("DataEntryInspector", () => {
  it("states that it does not write entries", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<DataEntryInspector />);
    expect(screen.getByTestId("data-entry-idle").textContent).toMatch(/does not write entries or sign/i);
    expect(screen.getByRole("textbox", { name: /^account$/i })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /^network$/i })).toBeTruthy();
  });

  it("renders text, a recent format change, and the reserve", async () => {
    install(inspectDataEntries(requestFor(textFixture), depsFor(textFixture)));
    render(<DataEntryInspector />);
    submit(textFixture.account.id);

    expect(await screen.findByTestId("decoded-text")).toHaveProperty("textContent", "hello");
    expect(screen.getByTestId("entry-table").textContent).toMatch(/account_id/);
    expect(screen.getByTestId("coverage-notice").textContent).toMatch(/2\.0000000 XLM/);
    expect(screen.getByTestId("data-entry-idle").textContent).toMatch(/does not write/i);
  });

  it("shows a binary hash as hex and not as text", async () => {
    install(inspectDataEntries(requestFor(binaryFixture), depsFor(binaryFixture)));
    render(<DataEntryInspector />);
    submit(binaryFixture.account.id);
    await screen.findByTestId("decoded-value");
    fireEvent.click(screen.getByRole("button", { name: "pointer" }));

    const panel = screen.getByTestId("decoded-value");
    expect(panel.textContent).toMatch(/hash/i);
    expect(panel.textContent).toMatch(/not as text/i);
    expect(panel.textContent).toContain("ab".repeat(32));
    expect(panel.textContent).not.toMatch(/hello/);
  });

  it("shows a deleted key with its last value and the oldest ledger", async () => {
    install(inspectDataEntries(requestFor(deletedFixture), depsFor(deletedFixture)));
    render(<DataEntryInspector />);
    submit(deletedFixture.account.id);

    const history = await screen.findByTestId("entry-history");
    expect(history.textContent).toMatch(/History truncated/);
    expect(history.textContent).toMatch(/Oldest ledger reached: 10/);
    expect(history.textContent).toMatch(/https:\/\/example.com\/a/);
    expect(screen.getByTestId("decoded-value").textContent).toMatch(/deleted/i);
  });

  it("shows an unavailable provider without entries", async () => {
    install(inspectDataEntries(requestFor(textFixture), unavailableDeps()));
    render(<DataEntryInspector />);
    submit(textFixture.account.id);
    const coverage = await screen.findByTestId("coverage-notice");
    expect(coverage.textContent).toMatch(/unavailable/i);
    expect(coverage.textContent).toMatch(/No entries were invented/);
    expect(screen.queryByTestId("entry-table")).toBeNull();
  });

  it("drops the report when the network changes and announces errors", async () => {
    install(inspectDataEntries(requestFor(textFixture), depsFor(textFixture)));
    render(<DataEntryInspector />);
    submit(textFixture.account.id);
    await screen.findByTestId("decoded-text");
    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-pubnet" } });
    await waitFor(() => {
      expect(screen.queryByTestId("decoded-text")).toBeNull();
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_request", message: "The data-entry request is invalid." }),
      })),
    );
    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-testnet" } });
    submit(textFixture.account.id);
    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid/i);
  });
});
