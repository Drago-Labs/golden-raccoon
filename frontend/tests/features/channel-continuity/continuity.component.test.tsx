import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelContinuityInspector } from "@/components/research/channel-continuity/ChannelContinuityInspector";
import { ContinuityError } from "@/server/research/channel-continuity/schema";
import { inspectChannelContinuity } from "@/server/research/channel-continuity/service";
import {
  emptySample,
  redirectAndDomainChurn,
  sameSymbolSeparateIssuers,
  unsafePrivateRedirect,
} from "./fixtures";

function installServiceFetch(options: { delayMs?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const report = inspectChannelContinuity(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as ContinuityError;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: failure.code, message: failure.message }),
      } as unknown as Response;
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChannelContinuityInspector", () => {
  it("shows an explicit empty state with no observations", () => {
    installServiceFetch();
    render(<ChannelContinuityInspector account="0xabc" network="stellar" />);

    expect(screen.getByText(/No channel observations are loaded/i)).toBeTruthy();
  });

  it("renders continuity evidence and never calls a change a takeover", async () => {
    installServiceFetch();
    render(<ChannelContinuityInspector input={redirectAndDomainChurn} account="0xabc" network="stellar" />);

    const notice = await screen.findByTestId("evidence-notice");
    expect(within(notice).getByText(/not proof of takeover/i)).toBeTruthy();

    const timeline = await screen.findByTestId("continuity-timeline");
    expect(within(timeline).getAllByText(/This does not establish:/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("cross-link-table")).toBeTruthy();
  });

  it("keeps same-symbol subjects visible as separate rows", async () => {
    installServiceFetch();
    render(<ChannelContinuityInspector input={sameSymbolSeparateIssuers} account="0xabc" network="stellar" />);

    const subjects = await screen.findByTestId("subject-table");
    expect(within(subjects).getByText("token-alpha")).toBeTruthy();
    expect(within(subjects).getByText("token-lookalike")).toBeTruthy();
  });

  it("supports keyboard focus of a continuity event", async () => {
    installServiceFetch();
    render(<ChannelContinuityInspector input={redirectAndDomainChurn} account="0xabc" network="stellar" />);

    await screen.findByTestId("continuity-timeline");
    const select = screen.getByLabelText(/Focus an event/i);
    fireEvent.change(select, { target: { value: (select as HTMLSelectElement).options[1]?.value } });

    await waitFor(() => expect(screen.getByTestId("focused-event")).toBeTruthy());
  });

  it("shows blocked unsafe URLs in coverage", async () => {
    installServiceFetch();
    render(<ChannelContinuityInspector input={unsafePrivateRedirect} account="0xabc" network="stellar" />);

    const coverage = await screen.findByTestId("source-coverage");
    expect(within(coverage).getAllByText(/blocked/i).length).toBeGreaterThan(0);
    expect(within(coverage).getByText(/1 blocked as unsafe/i)).toBeTruthy();
  });

  it("renders a distinguishable empty report", async () => {
    installServiceFetch();
    render(<ChannelContinuityInspector input={emptySample} account="0xabc" network="stellar" />);

    await screen.findByText(/nothing to inspect/i);
  });

  it("surfaces a failure without partial output", async () => {
    installServiceFetch();
    render(
      <ChannelContinuityInspector
        input={{ observedAt: "not-a-date", subjects: [], observations: [] }}
        account="0xabc"
        network="stellar"
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be inspected/i)).toBeTruthy();
    expect(screen.queryByTestId("evidence-notice")).toBeNull();
  });

  it("clears uploaded observations when the wallet session changes", async () => {
    installServiceFetch();
    const { rerender } = render(
      <ChannelContinuityInspector input={redirectAndDomainChurn} account="0xabc" network="stellar" />,
    );

    await screen.findByTestId("continuity-timeline");
    rerender(<ChannelContinuityInspector account="0xdifferent" network="stellar" />);

    await waitFor(() => expect(screen.queryByTestId("continuity-timeline")).toBeNull());
    expect(screen.getByText(/No channel observations are loaded/i)).toBeTruthy();
  });
});
