import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReconciliationWorkbench } from "@/components/research/balance-reconciliation/ReconciliationWorkbench";
import { reconcileBalances } from "@/server/research/balance-reconciliation/service";
import { depsFor, feeBumpFixture, matchedFixture, requestFor, unavailableDeps, unexplainedFixture } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function install(report: Promise<unknown>) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ report: await report }) })));
}

function submit(account: string) {
  fireEvent.change(screen.getByRole("textbox", { name: /^account$/i }), { target: { value: account } });
  fireEvent.submit(screen.getByRole("form", { name: /balance reconciliation/i }));
}

describe("ReconciliationWorkbench", () => {
  it("states that it does not convert prices or report tax", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ReconciliationWorkbench />);
    expect(screen.getByTestId("balance-idle").textContent).toMatch(/does not convert prices, report tax/i);
    expect(screen.getByRole("textbox", { name: /^from ledger$/i })).toBeTruthy();
  });

  it("shows a stroop match and both USD issuers", async () => {
    install(reconcileBalances(requestFor(matchedFixture), depsFor(matchedFixture)));
    render(<ReconciliationWorkbench />);
    submit(matchedFixture.account);
    const result = await screen.findByTestId("reconciliation-result");
    expect(result.textContent).toMatch(/Matched to the stroop/);
    const usd = [...result.textContent?.matchAll(/USD:/g) ?? []];
    expect(usd.length).toBe(2);
    expect(screen.getByTestId("category-breakdown").textContent).toMatch(/fee/);
  });

  it("shows an unexplained two-stroop delta", async () => {
    install(reconcileBalances(requestFor(unexplainedFixture), depsFor(unexplainedFixture)));
    render(<ReconciliationWorkbench />);
    submit(unexplainedFixture.account);
    expect((await screen.findByTestId("reconciliation-result")).textContent).toMatch(/delta 2 stroops/);
  });

  it("shows the sponsor fee and an unavailable provider", async () => {
    install(reconcileBalances(requestFor(feeBumpFixture), depsFor(feeBumpFixture)));
    render(<ReconciliationWorkbench />);
    submit(feeBumpFixture.account);
    expect((await screen.findByTestId("balance-timeline")).textContent).toMatch(/fee native -0.0000300/);

    install(reconcileBalances(requestFor(matchedFixture), unavailableDeps()));
    submit(matchedFixture.account);
    expect((await screen.findByTestId("coverage-notice")).textContent).toMatch(/unavailable/i);
  });

  it("drops the report when the network changes and announces errors", async () => {
    install(reconcileBalances(requestFor(matchedFixture), depsFor(matchedFixture)));
    render(<ReconciliationWorkbench />);
    submit(matchedFixture.account);
    await screen.findByText(/Matched to the stroop/);
    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-pubnet" } });
    await waitFor(() => expect(screen.queryByText(/Matched to the stroop/)).toBeNull());

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_request", message: "The reconciliation request is invalid." }) })));
    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-testnet" } });
    submit(matchedFixture.account);
    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid/i);
  });
});
