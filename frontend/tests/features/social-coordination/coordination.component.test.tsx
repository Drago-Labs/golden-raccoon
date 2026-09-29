import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialPatternWorkbench } from "@/components/research/social-coordination/SocialPatternWorkbench";
import { CoordinationError } from "@/server/research/social-coordination/schema";
import { analyseCoordination } from "@/server/research/social-coordination/service";
import {
  duplicatesMalformedHostile,
  emptySample,
  organicSpike,
  sparseSample,
  synchronizedCopyBurst,
} from "./fixtures";

function installServiceFetch(options: { delayMs?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const report = analyseCoordination(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as CoordinationError;
      return { ok: false, status: 400, json: async () => ({ error: failure.code, message: failure.message }) } as unknown as Response;
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SocialPatternWorkbench", () => {
  it("shows an explicit empty state with no observations", () => {
    installServiceFetch();
    render(<SocialPatternWorkbench account="0xabc" network="ethereum" />);

    expect(screen.getByText(/No observations are loaded/i)).toBeTruthy();
  });

  it("shows repeated-message clusters for a copy burst", async () => {
    installServiceFetch();
    render(<SocialPatternWorkbench input={synchronizedCopyBurst} account="0xabc" network="ethereum" />);

    const clusters = await screen.findByTestId("message-clusters");
    expect(within(clusters).getByText("Identical text")).toBeTruthy();
    expect(within(clusters).getByText(/40 messages · 4 distinct authors/)).toBeTruthy();
  });

  it("shows no cluster for an organic spike", async () => {
    installServiceFetch();
    render(<SocialPatternWorkbench input={organicSpike} account="0xabc" network="ethereum" />);

    await screen.findByTestId("measurement-notice");
    expect(screen.getByText(/what an organic conversation looks like/i)).toBeTruthy();
  });

  it("states what the measurements do not establish", async () => {
    installServiceFetch();
    render(<SocialPatternWorkbench input={synchronizedCopyBurst} account="0xabc" network="ethereum" />);

    const notice = await screen.findByTestId("measurement-notice");
    expect(within(notice).getByText(/no account is described as a bot/i)).toBeTruthy();
  });

  it("shows the threshold behind every finding", async () => {
    installServiceFetch();
    render(<SocialPatternWorkbench input={synchronizedCopyBurst} account="0xabc" network="ethereum" />);

    const findings = await screen.findByTestId("findings");
    expect(within(findings).getAllByText(/Threshold:/).length).toBeGreaterThan(0);
    expect(within(findings).getAllByText(/This does not establish:/).length).toBeGreaterThan(0);
  });

  it("returns insufficient evidence for a small sample rather than a verdict", async () => {
    installServiceFetch();
    render(<SocialPatternWorkbench input={sparseSample} account="0xabc" network="ethereum" />);

    const findings = await screen.findByTestId("findings");
    expect(within(findings).getByText("Insufficient evidence")).toBeTruthy();
    expect(within(findings).getByText(/absence of evidence, not evidence of absence/i)).toBeTruthy();
  });

  it("explains the sampling limits above the findings", async () => {
    installServiceFetch();
    render(<SocialPatternWorkbench input={duplicatesMalformedHostile} account="0xabc" network="ethereum" />);

    const notes = await screen.findByTestId("sampling-notes");
    expect(within(notes).getByText(/lower bound on what exists/i)).toBeTruthy();
    expect(within(notes).getByText(/manufacture synchronization/i)).toBeTruthy();
  });

  it("never renders markup from observation text", async () => {
    installServiceFetch();
    const { container } = render(
      <SocialPatternWorkbench input={duplicatesMalformedHostile} account="0xabc" network="ethereum" />,
    );

    await screen.findByTestId("measurement-notice");
    expect(container.querySelector("script")).toBeNull();
  });

  it("expands a cluster to show its supporting observations", async () => {
    installServiceFetch();
    render(<SocialPatternWorkbench input={synchronizedCopyBurst} account="0xabc" network="ethereum" />);

    const clusters = await screen.findByTestId("message-clusters");
    const toggle = within(clusters).getAllByRole("button")[0];

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    await waitFor(() => expect(toggle.getAttribute("aria-expanded")).toBe("true"));
    expect(within(clusters).getAllByText(/account-burst-/).length).toBeGreaterThan(0);
  });

  it("renders a distinguishable empty report", async () => {
    installServiceFetch();
    render(<SocialPatternWorkbench input={emptySample} account="0xabc" network="ethereum" />);

    await screen.findByText(/nothing to analyse/i);
  });

  it("surfaces a failure without partial output", async () => {
    installServiceFetch();
    render(
      <SocialPatternWorkbench
        input={{ observedAt: "not-a-date", observations: [] }}
        account="0xabc"
        network="ethereum"
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be analysed/i)).toBeTruthy();
    expect(screen.queryByTestId("measurement-notice")).toBeNull();
  });

  it("clears uploaded observations when the wallet session changes", async () => {
    installServiceFetch();
    const { rerender } = render(
      <SocialPatternWorkbench input={synchronizedCopyBurst} account="0xabc" network="ethereum" />,
    );

    await screen.findByTestId("message-clusters");

    rerender(<SocialPatternWorkbench account="0xdifferent" network="ethereum" />);

    await waitFor(() => expect(screen.queryByTestId("message-clusters")).toBeNull());
    expect(screen.getByText(/No observations are loaded/i)).toBeTruthy();
  });

  it("discards a response that resolves after the session moved on", async () => {
    installServiceFetch({ delayMs: 40 });
    const { rerender } = render(
      <SocialPatternWorkbench input={synchronizedCopyBurst} account="0xabc" network="ethereum" />,
    );

    rerender(<SocialPatternWorkbench account="0xdifferent" network="ethereum" />);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(screen.queryByTestId("message-clusters")).toBeNull();
    expect(screen.getByText(/No observations are loaded/i)).toBeTruthy();
  });
});
