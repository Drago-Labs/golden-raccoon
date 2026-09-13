import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExplanationWorkbench,
  clearStagedReports,
  sessionKeyFor,
  stageExplanationReport,
} from "@/components/research/risk-explanations/ExplanationWorkbench";
import { explainReport } from "@/server/research/risk-explanations/service";
import { completeAndUnlinkedReport, nonAdditiveAndConflictingReport } from "./fixtures";

const ACCOUNT = "0xabc";
const NETWORK = "ethereum";

/**
 * Backs the component's `fetch` with the real domain service, so the test
 * exercises the same document the route would return without opening a socket.
 */
function installServiceFetch(options: { delayMs?: number; failWith?: { status: number; body: unknown } } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    if (options.failWith) {
      return {
        ok: false,
        status: options.failWith.status,
        json: async () => options.failWith!.body,
      } as unknown as Response;
    }

    const body = JSON.parse(String(init?.body ?? "{}"));
    const result = explainReport(body);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        explanation: result.explanation,
        contradictions: result.contradictions,
        sourceHealth: result.sourceHealth,
      }),
    } as unknown as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  clearStagedReports();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearStagedReports();
});

describe("ExplanationWorkbench", () => {
  it("shows an explicit empty state when no report was handed off", () => {
    installServiceFetch();
    render(<ExplanationWorkbench account={ACCOUNT} network={NETWORK} handoffToken={null} />);

    expect(screen.getByText(/No report is selected/i)).toBeTruthy();
  });

  it("renders contributions, blockers and reconciliation for a staged report", async () => {
    installServiceFetch();
    const sessionKey = sessionKeyFor(ACCOUNT, "stellar-pubnet");
    const token = stageExplanationReport(sessionKey, nonAdditiveAndConflictingReport);

    render(<ExplanationWorkbench account={ACCOUNT} network="stellar-pubnet" handoffToken={token} />);

    const blockers = await screen.findByTestId("critical-blockers");
    expect(within(blockers).getByText(/Clawback enabled/)).toBeTruthy();
    expect(screen.getByText(/No exact decomposition is available/i)).toBeTruthy();
  });

  it("keeps critical blockers visible when a filter hides secondary factors", async () => {
    installServiceFetch();
    const sessionKey = sessionKeyFor(ACCOUNT, "stellar-pubnet");
    const token = stageExplanationReport(sessionKey, nonAdditiveAndConflictingReport);

    render(<ExplanationWorkbench account={ACCOUNT} network="stellar-pubnet" handoffToken={token} />);
    await screen.findByTestId("critical-blockers");

    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "descriptive" } });

    await waitFor(() => {
      expect(screen.getByText(/No contribution matches the active filter/i)).toBeTruthy();
    });
    expect(within(screen.getByTestId("critical-blockers")).getByText(/Clawback enabled/)).toBeTruthy();
  });

  it("labels descriptive rows as not recorded rather than zero", async () => {
    installServiceFetch();
    const sessionKey = sessionKeyFor(ACCOUNT, NETWORK);
    const token = stageExplanationReport(sessionKey, completeAndUnlinkedReport);

    render(<ExplanationWorkbench account={ACCOUNT} network={NETWORK} handoffToken={token} />);

    await screen.findByText(/What would change this decision/);
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
  });

  it("opens the evidence drawer from the contributions table", async () => {
    installServiceFetch();
    const sessionKey = sessionKeyFor(ACCOUNT, NETWORK);
    const token = stageExplanationReport(sessionKey, completeAndUnlinkedReport);

    render(<ExplanationWorkbench account={ACCOUNT} network={NETWORK} handoffToken={token} />);

    fireEvent.click(await screen.findByRole("button", { name: "Owner can mint" }));

    const drawer = screen.getByRole("complementary", { name: "Evidence detail" });
    expect(within(drawer).getByText("GoPlus")).toBeTruthy();
    expect(within(drawer).getByText(/onchain::owner-controls::owner-can-mint/)).toBeTruthy();
  });

  it("moves through the drill-down tree with the keyboard", async () => {
    installServiceFetch();
    const sessionKey = sessionKeyFor(ACCOUNT, NETWORK);
    const token = stageExplanationReport(sessionKey, completeAndUnlinkedReport);

    render(<ExplanationWorkbench account={ACCOUNT} network={NETWORK} handoffToken={token} />);

    const tree = await screen.findByRole("tree", { name: /drill-down/i });
    const root = within(tree).getAllByRole("treeitem")[0];
    root.focus();

    fireEvent.keyDown(tree, { key: "ArrowDown" });
    expect(document.activeElement).not.toBe(root);
    expect((document.activeElement as HTMLElement)?.getAttribute("role")).toBe("treeitem");
  });

  it("surfaces a failure without leaving a partial result on screen", async () => {
    installServiceFetch({ failWith: { status: 422, body: { error: "unsupported_report_version", message: "Unsupported." } } });
    const sessionKey = sessionKeyFor(ACCOUNT, NETWORK);
    const token = stageExplanationReport(sessionKey, completeAndUnlinkedReport);

    render(<ExplanationWorkbench account={ACCOUNT} network={NETWORK} handoffToken={token} />);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be analysed/i)).toBeTruthy();
    expect(screen.queryByRole("tree")).toBeNull();
  });

  it("refuses a handoff token minted for another wallet session", async () => {
    installServiceFetch();
    const otherSession = sessionKeyFor("0xdifferent", NETWORK);
    const token = stageExplanationReport(otherSession, completeAndUnlinkedReport);

    render(<ExplanationWorkbench account={ACCOUNT} network={NETWORK} handoffToken={token} />);

    await waitFor(() => {
      expect(screen.getByText(/No report is selected/i)).toBeTruthy();
    });
  });

  it("drops analysed data when the network changes mid-flight", async () => {
    installServiceFetch({ delayMs: 20 });
    const sessionKey = sessionKeyFor(ACCOUNT, NETWORK);
    const token = stageExplanationReport(sessionKey, completeAndUnlinkedReport);

    const { rerender } = render(<ExplanationWorkbench account={ACCOUNT} network={NETWORK} handoffToken={token} />);

    // Switch networks before the in-flight response resolves.
    rerender(<ExplanationWorkbench account={ACCOUNT} network="base" handoffToken={token} />);

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(screen.queryByText(/Owner can mint/)).toBeNull();
    expect(screen.getByText(/No report is selected/i)).toBeTruthy();
  });
});
