import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FailureDiagnosisWorkbench } from "@/components/research/tx-failure-diagnostics/FailureDiagnosisWorkbench";
import { diagnoseFailedTransaction } from "@/server/research/tx-failure-diagnostics/service";
import { depsFor, unavailableDeps, underfundedFixture } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FailureDiagnosisWorkbench", () => {
  it("states that it does not submit or retry before a hash is diagnosed", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<FailureDiagnosisWorkbench />);

    expect(screen.getByTestId("tx-failure-idle").textContent).toMatch(/does not submit, sign, or retry/i);
    expect(screen.getByRole("form", { name: /failed transaction hash/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /^transaction hash$/i })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /^network$/i })).toBeTruthy();
  });

  it("renders the aborting operation, the unattempted tail, and historical evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          report: await diagnoseFailedTransaction(
            { hash: underfundedFixture.hash, network: "stellar-testnet" },
            depsFor(underfundedFixture),
          ),
        }),
      })),
    );
    render(<FailureDiagnosisWorkbench />);
    fireEvent.change(screen.getByRole("textbox", { name: /^transaction hash$/i }), { target: { value: underfundedFixture.hash } });
    fireEvent.submit(screen.getByRole("form", { name: /failed transaction hash/i }));

    expect(await screen.findByText("op_underfunded")).toBeTruthy();
    expect(screen.getAllByText(/would have succeeded alone/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not attempted/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId("state-evidence").textContent).toMatch(/historical/);
    expect(screen.getByTestId("coverage-notice").textContent).toMatch(/complete/i);
  });

  it("shows an unavailable provider without a guessed result code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          report: await diagnoseFailedTransaction(
            { hash: underfundedFixture.hash, network: "stellar-testnet" },
            unavailableDeps(),
          ),
        }),
      })),
    );
    render(<FailureDiagnosisWorkbench />);
    fireEvent.change(screen.getByRole("textbox", { name: /^transaction hash$/i }), { target: { value: underfundedFixture.hash } });
    fireEvent.submit(screen.getByRole("form", { name: /failed transaction hash/i }));

    const coverage = await screen.findByTestId("coverage-notice");
    expect(coverage.textContent).toMatch(/unavailable/i);
    expect(coverage.textContent).toMatch(/No cause is inferred/);
    expect(screen.queryByTestId("operation-diagnosis")).toBeNull();
  });

  it("drops the diagnosis when the network changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          report: await diagnoseFailedTransaction(
            { hash: underfundedFixture.hash, network: "stellar-testnet" },
            depsFor(underfundedFixture),
          ),
        }),
      })),
    );
    render(<FailureDiagnosisWorkbench />);
    fireEvent.change(screen.getByRole("textbox", { name: /^transaction hash$/i }), { target: { value: underfundedFixture.hash } });
    fireEvent.submit(screen.getByRole("form", { name: /failed transaction hash/i }));
    await screen.findByText("op_underfunded");

    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-pubnet" } });
    await waitFor(() => {
      expect(screen.queryByText("op_underfunded")).toBeNull();
    });
  });

  it("announces a request error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_request", message: "The diagnosis request is invalid." }),
      })),
    );
    render(<FailureDiagnosisWorkbench />);
    fireEvent.change(screen.getByRole("textbox", { name: /^transaction hash$/i }), { target: { value: underfundedFixture.hash } });
    fireEvent.submit(screen.getByRole("form", { name: /failed transaction hash/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid/i);
  });
});
