import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CounterpartyProfile } from "@/components/research/counterparty-flows/CounterpartyProfile";
import { profileCounterparties } from "@/server/research/counterparty-flows/service";
import { depsFor, exchangeHeavy, requestFor } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function install(report: Promise<unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ report: await report }) })),
  );
}

describe("CounterpartyProfile", () => {
  it("states that it does not invent labels or change a risk score", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<CounterpartyProfile />);
    expect(screen.getByTestId("counterparty-flows-idle").textContent).toMatch(/does not invent labels/i);
    expect(screen.getByLabelText(/^account$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^window$/i)).toBeTruthy();
  });

  it("shows counterparty totals and a text chart alternative", async () => {
    install(profileCounterparties(requestFor(exchangeHeavy), depsFor(exchangeHeavy)));
    render(<CounterpartyProfile />);
    fireEvent.change(screen.getByLabelText(/^account$/i), { target: { value: exchangeHeavy.account } });
    fireEvent.submit(screen.getByRole("form", { name: /counterparty flows/i }));

    expect(await screen.findByTestId("counterparty-table")).toBeTruthy();
    expect(screen.getByTestId("flow-chart-text-alternative").textContent).toMatch(/Exchange Desk/);
    expect(screen.getByTestId("coverage-notice").textContent).toMatch(/Complete coverage/i);
  });

  it("drops the report when the network changes and announces errors", async () => {
    install(profileCounterparties(requestFor(exchangeHeavy), depsFor(exchangeHeavy)));
    render(<CounterpartyProfile />);
    fireEvent.change(screen.getByLabelText(/^account$/i), { target: { value: exchangeHeavy.account } });
    fireEvent.submit(screen.getByRole("form", { name: /counterparty flows/i }));
    await screen.findByTestId("counterparty-table");

    fireEvent.change(screen.getByLabelText(/^network$/i), { target: { value: "stellar-pubnet" } });
    await waitFor(() => expect(screen.queryByTestId("counterparty-table")).toBeNull());

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_request", message: "The counterparty-flow request is invalid." }),
      })),
    );
    fireEvent.change(screen.getByLabelText(/^network$/i), { target: { value: "stellar-testnet" } });
    fireEvent.submit(screen.getByRole("form", { name: /counterparty flows/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid/i);
  });
});
