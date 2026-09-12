import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceExplorer } from "@/components/research/evidence-coverage/EvidenceExplorer";
import { EvidenceError } from "@/server/research/evidence-coverage/schema";
import { exploreEvidence } from "@/server/research/evidence-coverage/service";
import {
  comparableAndIncomparableConflicts,
  duplicateSourceFamilies,
  emptyReport,
  staleMissingSecretFields,
  uncoveredClaim,
} from "./fixtures";

function installServiceFetch(options: { delayMs?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const report = exploreEvidence(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as EvidenceError;
      return { ok: false, status: 400, json: async () => ({ error: failure.code, message: failure.message }) } as unknown as Response;
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EvidenceExplorer", () => {
  it("shows an explicit empty state with no report", () => {
    installServiceFetch();
    render(<EvidenceExplorer account="0xabc" network="stellar-pubnet" />);

    expect(screen.getByText(/No report is loaded/i)).toBeTruthy();
  });

  it("shows one family's repeats as a single family, not corroboration", async () => {
    installServiceFetch();
    render(<EvidenceExplorer input={duplicateSourceFamilies} account="0xabc" network="stellar-pubnet" />);

    const table = await screen.findByRole("table", { name: /Coverage per claim/i });
    const row = within(table).getByRole("rowheader", { name: /Circulating supply/ }).closest("tr")!;

    expect(within(row).getByText("One source family")).toBeTruthy();
    expect(within(row).getByText(/2 repeats a counted family/i)).toBeTruthy();
  });

  it("shows two independent families as corroborated", async () => {
    installServiceFetch();
    render(<EvidenceExplorer input={duplicateSourceFamilies} account="0xabc" network="stellar-pubnet" />);

    const table = await screen.findByRole("table", { name: /Coverage per claim/i });
    const row = within(table).getByRole("rowheader", { name: /Holder count/ }).closest("tr")!;

    expect(within(row).getByText("Corroborated")).toBeTruthy();
  });

  it("lists declined comparisons alongside real contradictions", async () => {
    installServiceFetch();
    render(<EvidenceExplorer input={comparableAndIncomparableConflicts} account="0xabc" network="stellar-pubnet" />);

    const contradictions = await screen.findByTestId("contradictions");
    expect(within(contradictions).getByText("50000 vs 90000")).toBeTruthy();

    const table = screen.getByRole("table", { name: /Coverage per claim/i });
    fireEvent.click(within(table).getByRole("button", { name: /Liquidity depth in mixed units/ }));

    await waitFor(() => {
      const declined = screen.getByTestId("incomparable-pairs");
      expect(within(declined).getByText("Different unit")).toBeTruthy();
    });
  });

  it("shows an undated observation as unknown age rather than fresh", async () => {
    installServiceFetch();
    render(<EvidenceExplorer input={staleMissingSecretFields} account="0xabc" network="stellar-pubnet" />);

    const timeline = await screen.findByTestId("freshness-timeline");
    expect(within(timeline).getByText("Unknown age")).toBeTruthy();
    expect(within(timeline).getByText("No timestamp reported")).toBeTruthy();
  });

  it("reports that provider payloads were dropped", async () => {
    installServiceFetch();
    render(<EvidenceExplorer input={staleMissingSecretFields} account="0xabc" network="stellar-pubnet" />);

    const summary = await screen.findByTestId("redaction-summary");
    expect(within(summary).getByText(/denied wholesale, not filtered/i)).toBeTruthy();
  });

  it("never renders a provider payload value", async () => {
    installServiceFetch();
    const { container } = render(
      <EvidenceExplorer input={staleMissingSecretFields} account="0xabc" network="stellar-pubnet" />,
    );

    await screen.findByTestId("redaction-summary");
    expect(container.innerHTML).not.toContain("should-never-appear");
  });

  it("explains the family rationale that justifies grouping", async () => {
    installServiceFetch();
    render(<EvidenceExplorer input={duplicateSourceFamilies} account="0xabc" network="stellar-pubnet" />);

    const families = await screen.findByTestId("declared-families");
    expect(within(families).getByText(/resell the same upstream feed/i)).toBeTruthy();
  });

  it("shows a claim with no usable observation as uncovered", async () => {
    installServiceFetch();
    render(<EvidenceExplorer input={uncoveredClaim} account="0xabc" network="stellar-pubnet" />);

    await screen.findByRole("table", { name: /Coverage per claim/i });
    expect(screen.getByText("Uncovered")).toBeTruthy();
  });

  it("renders a distinguishable empty report", async () => {
    installServiceFetch();
    render(<EvidenceExplorer input={emptyReport} account="0xabc" network="stellar-pubnet" />);

    const rows = await screen.findAllByText(/no coverage to assess/i);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("surfaces a failure without partial output", async () => {
    installServiceFetch();
    render(
      <EvidenceExplorer
        input={{ ...duplicateSourceFamilies, families: [{ familyId: "x", label: "X", memberLabels: ["A"] }] as unknown[] }}
        account="0xabc"
        network="stellar-pubnet"
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be analysed/i)).toBeTruthy();
    expect(screen.queryByRole("table", { name: /Coverage per claim/i })).toBeNull();
  });

  it("drops a rendered report when the wallet session changes", async () => {
    installServiceFetch();
    const { rerender } = render(
      <EvidenceExplorer input={duplicateSourceFamilies} account="0xabc" network="stellar-pubnet" />,
    );

    await screen.findByRole("table", { name: /Coverage per claim/i });

    rerender(<EvidenceExplorer account="0xdifferent" network="stellar-pubnet" />);

    await waitFor(() => expect(screen.queryByRole("table", { name: /Coverage per claim/i })).toBeNull());
    expect(screen.getByText(/No report is loaded/i)).toBeTruthy();
  });

  it("discards a response that resolves after the session moved on", async () => {
    installServiceFetch({ delayMs: 40 });
    const { rerender } = render(
      <EvidenceExplorer input={duplicateSourceFamilies} account="0xabc" network="stellar-pubnet" />,
    );

    rerender(<EvidenceExplorer account="0xdifferent" network="stellar-pubnet" />);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(screen.queryByRole("table", { name: /Coverage per claim/i })).toBeNull();
    expect(screen.getByText(/No report is loaded/i)).toBeTruthy();
  });
});
