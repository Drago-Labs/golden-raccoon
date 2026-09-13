import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunComparisonWorkspace } from "@/components/research/run-comparison/RunComparisonWorkspace";
import { RunComparisonError } from "@/server/research/run-comparison/schema";
import { compareRuns } from "@/server/research/run-comparison/service";
import {
  RUN_AGENT_SET_CHANGED,
  RUN_AMBIGUOUS_FINDINGS,
  RUN_CHANGED_INPUTS,
  RUN_EARLIER,
  RUN_LATER_REORDERED,
  RUN_OTHER_SUBJECT,
  RUN_OTHER_WALLET,
  RUN_PROVIDER_OUTAGE,
  RUN_SINGLE_FINDING,
  WALLET,
  createRunReader,
} from "./fixtures";

const RUN_OPTIONS = [
  RUN_EARLIER,
  RUN_LATER_REORDERED,
  RUN_AGENT_SET_CHANGED,
  RUN_PROVIDER_OUTAGE,
  RUN_SINGLE_FINDING,
  RUN_AMBIGUOUS_FINDINGS,
  RUN_CHANGED_INPUTS,
  RUN_OTHER_SUBJECT,
  RUN_OTHER_WALLET,
].map((run) => ({ id: run.id, label: run.id }));

function installServiceFetch(options: { delayMs?: number } = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const report = await compareRuns(JSON.parse(String(init?.body ?? "{}")), createRunReader());

      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as RunComparisonError;

      return {
        ok: false,
        status: failure.status ?? 400,
        json: async () => ({ error: failure.code ?? "run_comparison_failed", message: failure.message }),
      } as unknown as Response;
    }
  });
}

function compare(leftId: string, rightId: string) {
  fireEvent.change(screen.getByLabelText(/first run/i), { target: { value: leftId } });
  fireEvent.change(screen.getByLabelText(/second run/i), { target: { value: rightId } });
  fireEvent.submit(screen.getByRole("form", { name: /run pair/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RunComparisonWorkspace", () => {
  it("starts idle and promises nothing is re-run", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    expect(screen.getByTestId("comparison-idle").textContent).toMatch(/nothing is re-run and no provider is contacted/i);
  });

  it("labels both selects and the submit action", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    expect(screen.getByLabelText(/first run/i)).toBeTruthy();
    expect(screen.getByLabelText(/second run/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /compare/i })).toBeTruthy();
  });

  it("refuses the same run on both sides before issuing a request", async () => {
    const fetchMock = installServiceFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_EARLIER.id);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows reordered results as unchanged rather than as wholesale change", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_LATER_REORDERED.id);

    const table = await screen.findByTestId("agent-difference-table");
    expect(within(table).getAllByText("In both")).toHaveLength(3);
    expect(within(table).queryByText(/Only in the/)).toBeNull();
  });

  it("shows an em dash, not a zero, for an agent that ran only once", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_AGENT_SET_CHANGED.id);

    const table = await screen.findByTestId("agent-difference-table");
    // Two agents ran only in the first run and one only in the second.
    expect(within(table).getAllByText("Only in the first")).toHaveLength(2);
    expect(within(table).getAllByText("Only in the second")).toHaveLength(1);
    expect(within(table).getAllByText(/—/).length).toBeGreaterThan(0);
  });

  it("always renders the this-is-not-a-cause caveat", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_LATER_REORDERED.id);

    const summary = await screen.findByTestId("comparison-summary");
    expect(within(summary).getByText(/shows what changed, not why/i)).toBeTruthy();
  });

  it("keeps a coverage drop in its own panel with timestamps", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_PROVIDER_OUTAGE.id);

    const quality = await screen.findByTestId("quality-changes");
    expect(within(quality).getByText("Coverage dropped")).toBeTruthy();
    expect(within(quality).getByText("2026-02-14T00:00:00.000Z")).toBeTruthy();
    expect(within(quality).getByText(/is not recorded and is not claimed here/i)).toBeTruthy();
  });

  it("separates the recommendation change from the observations", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_LATER_REORDERED.id);

    const change = await screen.findByTestId("recommendation-change");
    expect(within(change).getByText(/hold → reduce_exposure/)).toBeTruthy();
  });

  it("shows an undetermined finding pairing as undetermined", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_SINGLE_FINDING.id, RUN_AMBIGUOUS_FINDINGS.id);

    const table = await screen.findByTestId("agent-difference-table");
    expect(within(table).getByText("ambiguous")).toBeTruthy();
    expect(within(table).getByText(/No change is claimed between them/i)).toBeTruthy();
  });

  it("lists input differences as dotted paths", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_CHANGED_INPUTS.id);

    const inputs = await screen.findByTestId("input-changes");
    expect(within(inputs).getByText("balanceUsd")).toBeTruthy();
    expect(within(inputs).getByText("2500")).toBeTruthy();
  });

  it("labels a pair about two different assets", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_OTHER_SUBJECT.id);

    const summary = await screen.findByTestId("comparison-summary");
    expect(within(summary).getByText("different subject")).toBeTruthy();
    expect(within(summary).getByText(/not changes over time/i)).toBeTruthy();
  });

  it("surfaces an ownership failure without exposing run content", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_OTHER_WALLET.id);

    const error = await screen.findByTestId("comparison-error");
    expect(within(error).getByText(/not_found/)).toBeTruthy();
    expect(screen.queryByTestId("comparison-summary")).toBeNull();
  });

  it("refuses to compare with no wallet connected", async () => {
    const fetchMock = installServiceFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<RunComparisonWorkspace account={null} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_LATER_REORDERED.id);

    const error = await screen.findByTestId("comparison-error");
    expect(within(error).getByText(/connect a wallet/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a late response once a newer pair has been requested", async () => {
    const slow = installServiceFetch({ delayMs: 40 });
    const fast = installServiceFetch();
    let useSlow = true;

    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => (useSlow ? slow(url, init) : fast(url, init)));
    render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_PROVIDER_OUTAGE.id);
    useSlow = false;
    compare(RUN_EARLIER.id, RUN_LATER_REORDERED.id);

    const table = await screen.findByTestId("agent-difference-table");
    expect(within(table).queryByText("Coverage also dropped")).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 80));

    await waitFor(() => {
      expect(within(screen.getByTestId("agent-difference-table")).queryByText("Coverage also dropped")).toBeNull();
    });
  });

  it("discards the comparison when the account changes", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    const view = render(<RunComparisonWorkspace account={WALLET} runs={RUN_OPTIONS} />);

    compare(RUN_EARLIER.id, RUN_LATER_REORDERED.id);
    await screen.findByTestId("comparison-summary");

    view.rerender(<RunComparisonWorkspace account="0x1111111111111111111111111111111111111111" runs={RUN_OPTIONS} />);

    expect(screen.queryByTestId("comparison-summary")).toBeNull();
    expect(screen.getByTestId("comparison-idle")).toBeTruthy();
  });
});
