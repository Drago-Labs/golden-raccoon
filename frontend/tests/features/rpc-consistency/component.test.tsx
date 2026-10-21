import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsistencyWorkbench } from "@/components/research/rpc-consistency/ConsistencyWorkbench";
import { RpcConsistencyError } from "@/server/research/rpc-consistency/errors";
import { compareRpcConsistency } from "@/server/research/rpc-consistency/service";
import { ACCOUNT, conflicting, lagging, matched, probesFor, unavailable } from "./fixtures";

function install(fixture: Parameters<typeof probesFor>[0]) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));

    try {
      const report = await compareRpcConsistency(body, probesFor(fixture));

      return { ok: true, status: 200, json: async () => ({ report }) };
    } catch (error) {
      const failure = error as RpcConsistencyError;

      return {
        ok: false,
        status: 400,
        json: async () => ({ error: failure.code ?? "rpc_consistency_failed", message: failure.message }),
      };
    }
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /compare providers/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ConsistencyWorkbench", () => {
  it("names the form, the target, and the network", () => {
    vi.stubGlobal("fetch", install(matched));
    render(<ConsistencyWorkbench />);

    expect(screen.getByRole("form", { name: /compare horizon and stellar rpc/i })).toBeTruthy();
    expect(screen.getByLabelText("Account or contract")).toBeTruthy();
    expect(screen.getByLabelText("Network")).toBeTruthy();
    expect(screen.getByLabelText("Contract data keys")).toBeTruthy();
  });

  it("starts idle and stays on one column", () => {
    vi.stubGlobal("fetch", install(matched));
    render(<ConsistencyWorkbench />);
    const workbench = screen.getByTestId("consistency-workbench");

    expect(screen.getByTestId("consistency-idle").textContent).toMatch(/read-only/i);
    expect(workbench.className).toMatch(/flex-col/);
    expect(workbench.className).toMatch(/min-w-0/);
    expect(workbench.className).toMatch(/max-w-full/);
  });

  it("does not fetch when the target is empty", async () => {
    const fetchMock = install(matched);
    vi.stubGlobal("fetch", fetchMock);
    render(<ConsistencyWorkbench />);

    submit();

    const error = await screen.findByTestId("consistency-error");
    expect(within(error).getByText(/enter a stellar account or contract/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a matched account with both provider windows", async () => {
    vi.stubGlobal("fetch", install(matched));
    render(<ConsistencyWorkbench initialTarget={ACCOUNT} />);

    submit();

    const coverage = await screen.findByTestId("coverage-notice");
    expect(within(coverage).getByText("Complete")).toBeTruthy();

    const providers = screen.getByTestId("provider-status");
    expect(within(providers).getAllByText("5100").length).toBe(2);
    expect(within(providers).getAllByText(/Ledgers 1000–5100/).length).toBe(2);
    expect(screen.getByTestId("field-native_balance").textContent).toMatch(/Matched/);
    expect(screen.queryByTestId("conflict-native_balance")).toBeNull();
  });

  it("describes different ledgers as lag and does not show a conflict", async () => {
    vi.stubGlobal("fetch", install(lagging));
    render(<ConsistencyWorkbench initialTarget={ACCOUNT} />);

    submit();

    const field = await screen.findByTestId("field-native_balance");
    expect(within(field).getByText("Lag")).toBeTruthy();
    expect(field.textContent).toMatch(/not a conflict/i);
    expect(screen.queryByTestId("conflict-native_balance")).toBeNull();
    expect(screen.getByTestId("lag-summary").textContent).toMatch(/not a conflict/i);
  });

  it("shows both raw values when the same ledger conflicts", async () => {
    vi.stubGlobal("fetch", install(conflicting));
    render(<ConsistencyWorkbench initialTarget={ACCOUNT} />);

    submit();

    const conflict = await screen.findByTestId("conflict-native_balance");
    expect(within(conflict).getByText("Horizon raw value")).toBeTruthy();
    expect(within(conflict).getByText("Stellar RPC raw value")).toBeTruthy();
    expect(conflict.textContent).toContain("10.0000000");
    expect(conflict.textContent).toContain("90000000");
    expect(conflict.className).toMatch(/grid-cols-1/);
  });

  it("labels a single-source result when Horizon is unavailable", async () => {
    vi.stubGlobal("fetch", install(unavailable));
    render(<ConsistencyWorkbench initialTarget={ACCOUNT} />);

    submit();

    const coverage = await screen.findByTestId("coverage-notice");
    expect(within(coverage).getByText("Single source")).toBeTruthy();
    expect(screen.getByTestId("provider-horizon").textContent).toMatch(/Horizon unavailable/);
    expect(screen.getByTestId("field-native_balance").textContent).toMatch(/single-source result from Stellar RPC/i);
  });

  it("surfaces an endpoint error with its code", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_target", message: "Provide a Stellar account id (G…) or contract id (C…)." }),
    }));
    render(<ConsistencyWorkbench initialTarget={ACCOUNT} />);

    submit();

    const error = await screen.findByTestId("consistency-error");
    expect(within(error).getByText(/invalid_target/)).toBeTruthy();
  });
});
