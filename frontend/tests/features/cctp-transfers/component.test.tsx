import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CctpTracker } from "@/components/research/cctp-transfers/CctpTracker";
import { trackCctpTransfer } from "@/server/research/cctp-transfers/service";
import { noopDeps } from "./fixtures";

function installServiceFetch(options: { fail?: boolean } = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.fail) {
      return { ok: false, status: 400, json: async () => ({ error: "unknown_source_chain", message: "unknown chain" }) } as unknown as Response;
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const deps = {
      ...noopDeps(),
      decodeSourceBurn: async () => ({
        state: "pending" as const,
        blockNumber: null,
        nonce: null,
        burnTokenAddress: null,
        depositorAddress: null,
        mintRecipientRaw: null,
        mintRecipientDisplay: null,
        destinationDomain: null,
        destinationChain: "not yet known",
        maxFeeBaseUnits: null,
        minFinalityThreshold: null,
        amountBaseUnits: null,
        rawMessageHex: null,
        issues: ["The transaction was not found yet."],
      }),
    };
    const report = await trackCctpTransfer(body, deps);

    return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CctpTracker", () => {
  it("labels the transfer input for assistive technology", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<CctpTracker />);

    expect(screen.getByRole("form", { name: /cctp transfer tracker transfer input/i })).toBeTruthy();
    expect(screen.getByLabelText("Source chain")).toBeTruthy();
    expect(screen.getByLabelText("Source transaction hash")).toBeTruthy();
    expect(screen.getByRole("button", { name: /track transfer/i })).toBeTruthy();
  });

  it("shows a report after submitting a transaction hash", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<CctpTracker />);

    fireEvent.change(screen.getByLabelText("Source transaction hash"), { target: { value: "0xabc" } });
    fireEvent.submit(screen.getByRole("form", { name: /cctp transfer tracker transfer input/i }));

    await waitFor(() => {
      expect(screen.getByTestId("step-timeline")).toBeTruthy();
      expect(screen.getByTestId("amount-reconciliation")).toBeTruthy();
    });
  });

  it("shows an alert on a failed request", async () => {
    vi.stubGlobal("fetch", installServiceFetch({ fail: true }));
    render(<CctpTracker />);

    fireEvent.change(screen.getByLabelText("Source transaction hash"), { target: { value: "0xabc" } });
    fireEvent.submit(screen.getByRole("form", { name: /cctp transfer tracker transfer input/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });
});
