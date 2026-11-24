import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssuanceLedger } from "@/components/research/issuance-ledger/IssuanceLedger";
import { reconcileIssuance } from "@/server/research/issuance-ledger/service";
import { depsFor, reconciledFixture, requestFor, unavailableDeps, unreconciledFixture } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function install(report: Promise<unknown>) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ report: await report }) })));
}

function submit(assetCode: string, issuer: string) {
  fireEvent.change(screen.getByRole("textbox", { name: /^asset code$/i }), { target: { value: assetCode } });
  fireEvent.change(screen.getByRole("textbox", { name: /^issuer$/i }), { target: { value: issuer } });
  fireEvent.submit(screen.getByRole("form", { name: /issuance ledger/i }));
}

describe("IssuanceLedger", () => {
  it("states that it does not assert misconduct", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<IssuanceLedger />);
    expect(screen.getByTestId("issuance-idle").textContent).toMatch(/does not assert misconduct/i);
    expect(screen.getByRole("textbox", { name: /^from ledger$/i })).toBeTruthy();
  });

  it("shows reconciled checkpoints and a supply chart text alternative", async () => {
    install(reconcileIssuance(requestFor(reconciledFixture), depsFor(reconciledFixture)));
    render(<IssuanceLedger />);
    submit(reconciledFixture.asset_code, reconciledFixture.issuer);
    expect((await screen.findByTestId("reconciliation-table")).textContent).toMatch(/Reconciled at checkpoints/);
    expect(screen.getByTestId("supply-chart").textContent).toMatch(/Ledger 10/);
    expect(screen.getByTestId("operation-ledger").textContent).toMatch(/mint/);
  });

  it("shows unreconciled differences with surrounding operations", async () => {
    install(reconcileIssuance(requestFor(unreconciledFixture), depsFor(unreconciledFixture)));
    render(<IssuanceLedger />);
    submit(unreconciledFixture.asset_code, unreconciledFixture.issuer);
    const table = await screen.findByTestId("reconciliation-table");
    expect(table.textContent).toMatch(/Unreconciled differences/);
    expect(screen.getByTestId("unreconciled-gaps").textContent).toMatch(/delta 2 stroops/);
  });

  it("shows an unavailable provider notice", async () => {
    install(reconcileIssuance(requestFor(reconciledFixture), unavailableDeps()));
    render(<IssuanceLedger />);
    submit(reconciledFixture.asset_code, reconciledFixture.issuer);
    expect((await screen.findByTestId("coverage-notice")).textContent).toMatch(/unavailable/i);
  });

  it("drops the report when the network changes and announces errors", async () => {
    install(reconcileIssuance(requestFor(reconciledFixture), depsFor(reconciledFixture)));
    render(<IssuanceLedger />);
    submit(reconciledFixture.asset_code, reconciledFixture.issuer);
    await screen.findByText(/Reconciled at checkpoints/);
    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-pubnet" } });
    await waitFor(() => expect(screen.queryByText(/Reconciled at checkpoints/)).toBeNull());

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_request", message: "The issuance ledger request is invalid." }),
      })),
    );
    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-testnet" } });
    submit(reconciledFixture.asset_code, reconciledFixture.issuer);
    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid/i);
  });
});
