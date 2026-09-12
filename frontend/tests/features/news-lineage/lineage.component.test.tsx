import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewsLineagePanel } from "@/components/research/news-lineage/NewsLineagePanel";
import { LineageError } from "@/server/research/news-lineage/schema";
import { analyseLineage } from "@/server/research/news-lineage/service";
import {
  correctionsMissingEventTime,
  emptyEvidence,
  multilingualSparseAdversarial,
  similarTitlesDistinctBodies,
  syndicatedAndIndependentReports,
} from "./fixtures";

function installServiceFetch(options: { delayMs?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const report = analyseLineage(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as LineageError;
      return { ok: false, status: 400, json: async () => ({ error: failure.code, message: failure.message }) } as unknown as Response;
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NewsLineagePanel", () => {
  it("shows an explicit empty state with no evidence", () => {
    installServiceFetch();
    render(<NewsLineagePanel account="0xabc" network="ethereum" />);

    expect(screen.getByText(/No article evidence is loaded/i)).toBeTruthy();
  });

  it("shows syndication as one report, not several confirmations", async () => {
    installServiceFetch();
    render(<NewsLineagePanel input={syndicatedAndIndependentReports} account="0xabc" network="ethereum" />);

    const table = await screen.findByRole("table", { name: /Independent reporting per lineage/i });
    expect(within(table).getByText(/single report, not 3 confirmations/i)).toBeTruthy();
  });

  it("keeps independent reports in separate lineages", async () => {
    installServiceFetch();
    render(<NewsLineagePanel input={similarTitlesDistinctBodies} account="0xabc" network="ethereum" />);

    const clusters = await screen.findByTestId("story-clusters");
    expect(within(clusters).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the reason a member was placed in a lineage", async () => {
    installServiceFetch();
    render(<NewsLineagePanel input={syndicatedAndIndependentReports} account="0xabc" network="ethereum" />);

    const clusters = await screen.findByTestId("story-clusters");

    const wire = within(clusters)
      .getAllByRole("button")
      .find((button) => (button.textContent ?? "").includes("Syndication only"));

    expect(wire).toBeDefined();

    if (wire!.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(wire!);
    }

    await waitFor(() => {
      expect(screen.getAllByText(/Declared syndication/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/Republishing is not independent reporting/i).length).toBeGreaterThan(0);
  });

  it("separates event time from publication time on the chronology", async () => {
    installServiceFetch();
    render(<NewsLineagePanel input={correctionsMissingEventTime} account="0xabc" network="ethereum" />);

    const timeline = await screen.findByTestId("claim-timeline");
    expect(within(timeline).getByText("Event time")).toBeTruthy();
    expect(within(timeline).getAllByText("Publication time").length).toBeGreaterThan(0);
  });

  it("shows an undated article as not placeable rather than dating it", async () => {
    installServiceFetch();
    render(<NewsLineagePanel input={correctionsMissingEventTime} account="0xabc" network="ethereum" />);

    const timeline = await screen.findByTestId("claim-timeline");
    expect(within(timeline).getByText("Not placeable")).toBeTruthy();
    expect(within(timeline).getByText("No usable timestamp")).toBeTruthy();
  });

  it("flags a correction", async () => {
    installServiceFetch();
    render(<NewsLineagePanel input={correctionsMissingEventTime} account="0xabc" network="ethereum" />);

    const timeline = await screen.findByTestId("claim-timeline");
    expect(within(timeline).getByText("Correction")).toBeTruthy();
  });

  it("never renders markup from a provider title", async () => {
    installServiceFetch();
    const { container } = render(
      <NewsLineagePanel input={multilingualSparseAdversarial} account="0xabc" network="ethereum" />,
    );

    await screen.findByTestId("story-clusters");
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("<b>Bold</b>");
  });

  it("states that no score was changed", async () => {
    installServiceFetch();
    render(<NewsLineagePanel input={syndicatedAndIndependentReports} account="0xabc" network="ethereum" />);

    const notice = await screen.findByTestId("score-unchanged-notice");
    expect(within(notice).getByText(/not a confirmation guarantee/i)).toBeTruthy();
  });

  it("renders a distinguishable empty report", async () => {
    installServiceFetch();
    render(<NewsLineagePanel input={emptyEvidence} account="0xabc" network="ethereum" />);

    await screen.findByText(/no lineage to build/i);
  });

  it("surfaces a failure without partial output", async () => {
    installServiceFetch();
    render(<NewsLineagePanel input={{ observedAt: "not-a-date", articles: [] }} account="0xabc" network="ethereum" />);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be analysed/i)).toBeTruthy();
    expect(screen.queryByTestId("story-clusters")).toBeNull();
  });

  it("drops a rendered report when the wallet session changes", async () => {
    installServiceFetch();
    const { rerender } = render(
      <NewsLineagePanel input={syndicatedAndIndependentReports} account="0xabc" network="ethereum" />,
    );

    await screen.findByTestId("story-clusters");

    rerender(<NewsLineagePanel account="0xdifferent" network="ethereum" />);

    await waitFor(() => expect(screen.queryByTestId("story-clusters")).toBeNull());
    expect(screen.getByText(/No article evidence is loaded/i)).toBeTruthy();
  });

  it("discards a response that resolves after the session moved on", async () => {
    installServiceFetch({ delayMs: 40 });
    const { rerender } = render(
      <NewsLineagePanel input={syndicatedAndIndependentReports} account="0xabc" network="ethereum" />,
    );

    rerender(<NewsLineagePanel account="0xdifferent" network="ethereum" />);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(screen.queryByTestId("story-clusters")).toBeNull();
    expect(screen.getByText(/No article evidence is loaded/i)).toBeTruthy();
  });
});
