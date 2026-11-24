import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConformanceReport } from "@/components/research/sep41-conformance/ConformanceReport";
import { CONTRACT_ID } from "./fixtures";

const completeReport = {
  schemaVersion: "sep41-conformance/2026-01",
  referenceVersion: "SEP-41/2024-11",
  contractId: CONTRACT_ID,
  network: "stellar-pubnet",
  state: "complete",
  interfaceDiff: [
    {
      name: "balance",
      kind: "match",
      detail: "Matches SEP-41",
    },
  ],
  simulations: [
    { function: "decimals", ok: true, value: 7, authorizationRequired: false, error: null },
  ],
  eventSamples: [
    {
      id: "evt-1",
      ledger: 10,
      topicName: "transfer",
      topics: ["transfer", "A", "B"],
      dataKind: "i128",
      dataKeys: [],
      rawSummary: "{}",
    },
  ],
  eventShapes: [
    {
      eventName: "transfer",
      sampleId: "evt-1",
      ok: true,
      mismatchedField: null,
      detail: "ok",
    },
  ],
  findings: [],
  coverage: {
    referenceVersion: "SEP-41/2024-11",
    reachedProvider: true,
    specAvailable: true,
    interfaceMatches: 1,
    interfaceMissing: 0,
    interfaceMismatched: 0,
    interfaceExtra: 0,
    simulationsOk: 1,
    simulationsAttempted: 1,
    eventsSampled: 1,
    eventShapeFailures: 0,
    message: "Reference SEP-41/2024-11.",
  },
  readOnly: true,
  writesState: false,
};

describe("ConformanceReport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes an accessible form, submits, and renders results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ report: completeReport }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<ConformanceReport />);
    fireEvent.change(screen.getByLabelText("Contract id"), { target: { value: CONTRACT_ID } });
    fireEvent.click(screen.getByRole("button", { name: "Check SEP-41 conformance" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "SEP-41 conformance results" })).toBeTruthy());
    expect(screen.getByRole("table", { name: "SEP-41 interface comparison" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "SEP-41 event samples" })).toBeTruthy();
    expect(screen.getByLabelText("Coverage notice")).toBeTruthy();
  });

  it("shows an alert on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "provider_unavailable", message: "Provider unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<ConformanceReport />);
    fireEvent.change(screen.getByLabelText("Contract id"), { target: { value: CONTRACT_ID } });
    fireEvent.click(screen.getByRole("button", { name: "Check SEP-41 conformance" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Provider unavailable");
  });
});
