import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportComparison } from "@/components/research/report-comparison/ReportComparison";
import { compareSnapshots } from "@/server/research/report-comparison/service";
import { ComparisonError } from "@/server/research/report-comparison/schema";
import { ALL_RECORDS, addedRemovedAmbiguousPair, emptyPair, reorderedEquivalentPair, revokedRecord, stubAdapter } from "./fixtures";

const adapter = stubAdapter(ALL_RECORDS);

/**
 * Backs the component's `fetch` with the real domain service, so the rendered
 * output is the same document the route would produce, without a socket.
 */
function installServiceFetch(options: { delayMs?: number } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    const query = new URL(url, "http://localhost").searchParams;

    try {
      const comparison = await compareSnapshots(
        { leftId: query.get("leftId") ?? "", rightId: query.get("rightId") ?? "" },
        adapter,
      );
      return { ok: true, status: 200, json: async () => ({ comparison }) } as unknown as Response;
    } catch (error) {
      const failure = error as ComparisonError;
      return {
        ok: false,
        status: 410,
        json: async () => ({ error: failure.code, message: failure.detail }),
      } as unknown as Response;
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReportComparison", () => {
  it("shows an explicit empty state before a comparison is requested", () => {
    installServiceFetch();
    render(<ReportComparison account="0xabc" network="ethereum" />);

    expect(screen.getByText(/No comparison yet/i)).toBeTruthy();
  });

  it("compares a pair entered through the selector", async () => {
    installServiceFetch();
    render(<ReportComparison account="0xabc" network="ethereum" />);

    fireEvent.change(screen.getByLabelText(/Earlier snapshot id/i), {
      target: { value: reorderedEquivalentPair.left.id },
    });
    fireEvent.change(screen.getByLabelText(/Later snapshot id/i), {
      target: { value: reorderedEquivalentPair.right.id },
    });
    fireEvent.click(screen.getByRole("button", { name: /Compare snapshots/i }));

    await screen.findByTestId("materially-identical");
    expect(screen.getByText(/No material difference/i)).toBeTruthy();
  });

  it("warns that lost evidence is not a resolved risk", async () => {
    installServiceFetch();
    render(
      <ReportComparison
        account="0xabc"
        network="ethereum"
        initialLeftId={addedRemovedAmbiguousPair.left.id}
        initialRightId={addedRemovedAmbiguousPair.right.id}
      />,
    );

    const notice = await screen.findByTestId("evidence-lost-notice");
    expect(within(notice).getByText(/not the same as a resolved risk/i)).toBeTruthy();
  });

  it("keeps an unobservable value distinct from a numeric decrease", async () => {
    installServiceFetch();
    render(
      <ReportComparison
        account="0xabc"
        network="ethereum"
        initialLeftId={addedRemovedAmbiguousPair.left.id}
        initialRightId={addedRemovedAmbiguousPair.right.id}
      />,
    );

    await screen.findByTestId("evidence-lost-notice");
    expect(screen.getAllByText(/Stopped being observable/i).length).toBeGreaterThan(0);
  });

  it("renders a distinguishable empty comparison", async () => {
    installServiceFetch();
    render(
      <ReportComparison
        account="0xabc"
        network="ethereum"
        initialLeftId={emptyPair.left.id}
        initialRightId={emptyPair.right.id}
      />,
    );

    await screen.findByTestId("materially-identical");
    expect(screen.getByText(/nothing to compare/i)).toBeTruthy();
  });

  it("surfaces a revoked snapshot as an error with no partial output", async () => {
    installServiceFetch();
    render(
      <ReportComparison
        account="0xabc"
        network="ethereum"
        initialLeftId={reorderedEquivalentPair.left.id}
        initialRightId={revokedRecord.id}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be compared/i)).toBeTruthy();
    expect(screen.queryByTestId("materially-identical")).toBeNull();
  });

  it("validates the selector before issuing a request", async () => {
    const fetchMock = installServiceFetch();
    render(<ReportComparison account="0xabc" network="ethereum" />);

    fireEvent.change(screen.getByLabelText(/Earlier snapshot id/i), { target: { value: "snapshot_same" } });
    fireEvent.change(screen.getByLabelText(/Later snapshot id/i), { target: { value: "snapshot_same" } });
    fireEvent.click(screen.getByRole("button", { name: /Compare snapshots/i }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Choose two different snapshots.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops a rendered comparison when the wallet session changes", async () => {
    installServiceFetch();
    const { rerender } = render(
      <ReportComparison
        account="0xabc"
        network="ethereum"
        initialLeftId={reorderedEquivalentPair.left.id}
        initialRightId={reorderedEquivalentPair.right.id}
      />,
    );

    await screen.findByTestId("materially-identical");

    // Switching wallet remounts the session component. Nothing derived from
    // the previous account may survive the switch.
    rerender(<ReportComparison account="0xdifferent" network="ethereum" />);

    await waitFor(() => {
      expect(screen.queryByTestId("materially-identical")).toBeNull();
    });
    expect(screen.getByText(/No comparison yet/i)).toBeTruthy();
  });

  it("discards a response that resolves after the session moved on", async () => {
    installServiceFetch({ delayMs: 40 });
    const { rerender } = render(
      <ReportComparison
        account="0xabc"
        network="ethereum"
        initialLeftId={reorderedEquivalentPair.left.id}
        initialRightId={reorderedEquivalentPair.right.id}
      />,
    );

    // Move to a session with no pending pair before the first request settles.
    rerender(<ReportComparison account="0xdifferent" network="ethereum" />);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(screen.queryByTestId("materially-identical")).toBeNull();
    expect(screen.getByText(/No comparison yet/i)).toBeTruthy();
  });
});
