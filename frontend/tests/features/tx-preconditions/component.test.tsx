import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreconditionExplainer } from "@/components/research/tx-preconditions/PreconditionExplainer";
import { explainTransactionPreconditions } from "@/server/research/tx-preconditions/service";
import { depsFor, unavailableDeps, validNowFixture } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PreconditionExplainer", () => {
  it("states that it does not submit or sign before an envelope is explained", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<PreconditionExplainer />);

    expect(screen.getByTestId("tx-preconditions-idle").textContent).toMatch(/does not submit, sign/i);
    expect(screen.getByRole("form", { name: /transaction preconditions/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /transaction envelope xdr/i })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: /^network$/i })).toBeTruthy();
  });

  it("renders precondition rows and a validity window for a valid fixture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          report: await explainTransactionPreconditions(
            {
              envelopeXdr: validNowFixture.envelope_xdr,
              network: "stellar-testnet",
              evaluatedAt: validNowFixture.evaluated_at,
            },
            depsFor(validNowFixture),
          ),
        }),
      })),
    );
    render(<PreconditionExplainer />);
    fireEvent.change(screen.getByRole("textbox", { name: /transaction envelope xdr/i }), {
      target: { value: validNowFixture.envelope_xdr },
    });
    fireEvent.submit(screen.getByRole("form", { name: /transaction preconditions/i }));

    expect(await screen.findByTestId("precondition-table")).toBeTruthy();
    expect(screen.getByTestId("validity-timeline").textContent).toMatch(/Currently valid: yes/i);
    expect(screen.getByTestId("coverage-notice").textContent).toMatch(/complete/i);
  });

  it("shows an unavailable provider without inventing validity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({
          report: await explainTransactionPreconditions(
            {
              envelopeXdr: validNowFixture.envelope_xdr,
              network: "stellar-testnet",
              evaluatedAt: validNowFixture.evaluated_at,
            },
            unavailableDeps(),
          ),
        }),
      })),
    );
    render(<PreconditionExplainer />);
    fireEvent.change(screen.getByRole("textbox", { name: /transaction envelope xdr/i }), {
      target: { value: validNowFixture.envelope_xdr },
    });
    fireEvent.submit(screen.getByRole("form", { name: /transaction preconditions/i }));

    const coverage = await screen.findByTestId("coverage-notice");
    expect(coverage.textContent).toMatch(/unavailable/i);
    expect(screen.getByTestId("validity-current").textContent).toMatch(/Currently valid: no/i);
  });

  it("drops the report when the network changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          report: await explainTransactionPreconditions(
            {
              envelopeXdr: validNowFixture.envelope_xdr,
              network: "stellar-testnet",
              evaluatedAt: validNowFixture.evaluated_at,
            },
            depsFor(validNowFixture),
          ),
        }),
      })),
    );
    render(<PreconditionExplainer />);
    fireEvent.change(screen.getByRole("textbox", { name: /transaction envelope xdr/i }), {
      target: { value: validNowFixture.envelope_xdr },
    });
    fireEvent.submit(screen.getByRole("form", { name: /transaction preconditions/i }));
    await screen.findByTestId("precondition-table");

    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), {
      target: { value: "stellar-pubnet" },
    });

    await waitFor(() => {
      expect(screen.queryByTestId("precondition-table")).toBeNull();
    });
  });
});
