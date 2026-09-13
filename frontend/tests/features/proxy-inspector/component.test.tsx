import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProxyInspector } from "@/components/research/proxy-inspector/ProxyInspector";
import { inspectProxy } from "@/server/research/proxy-inspector/service";
import { ProxyInspectorError, type ChainReader } from "@/server/research/proxy-inspector/schema";
import {
  ADMIN,
  BEACON_IMPL,
  IMPLEMENTATION,
  PROXY,
  beaconProxyWorld,
  conflictingSlotsWorld,
  createFixtureReader,
  directProxyWorld,
  eoaWorld,
  type FixtureWorld,
  unavailableWorld,
  uupsUnknownAuthorityWorld,
} from "./fixtures";

/**
 * Routes the component's fetch through the real service and a fixture reader,
 * so a component test exercises the contract the page actually receives.
 */
function installServiceFetch(worldFor: (network: string) => FixtureWorld, options: { delayMs?: number } = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body ?? "{}")) as { network?: string };

    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const reader: ChainReader = createFixtureReader(worldFor(request.network ?? "ethereum"));
      const report = await inspectProxy(request, reader);

      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as ProxyInspectorError;

      return {
        ok: false,
        status: 400,
        json: async () => ({ error: failure.code, message: failure.message }),
      } as unknown as Response;
    }
  });
}

function submit(address: string = PROXY, network?: string) {
  fireEvent.change(screen.getByLabelText(/contract address/i), { target: { value: address } });

  if (network) {
    fireEvent.change(screen.getByLabelText(/network/i), { target: { value: network } });
  }

  // Submitted through the form rather than the button so the helper keeps
  // working while the button is in its busy state.
  fireEvent.submit(screen.getByRole("form", { name: /contract inspection/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProxyInspector", () => {
  it("starts in an explicit idle state that promises no signature", () => {
    vi.stubGlobal("fetch", installServiceFetch(() => directProxyWorld));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    expect(screen.getByTestId("inspector-idle").textContent).toMatch(/no signature is requested/i);
  });

  it("labels every input so the flow is reachable by keyboard", () => {
    vi.stubGlobal("fetch", installServiceFetch(() => directProxyWorld));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    expect(screen.getByLabelText(/contract address/i)).toBeTruthy();
    expect(screen.getByLabelText(/network/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /inspect/i })).toBeTruthy();
  });

  it("rejects a malformed address before issuing a request", async () => {
    const fetchMock = installServiceFetch(() => directProxyWorld);
    vi.stubGlobal("fetch", fetchMock);
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit("0xnope");

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the submit button labelled while a read is in flight", async () => {
    vi.stubGlobal("fetch", installServiceFetch(() => directProxyWorld, { delayMs: 20 }));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    expect(screen.getByRole("button", { name: /reading/i })).toBeTruthy();
    expect(screen.getByTestId("inspector-loading")).toBeTruthy();

    await screen.findByTestId("inspector-summary");
  });

  it("shows the implementation path with its slot evidence", async () => {
    vi.stubGlobal("fetch", installServiceFetch(() => directProxyWorld));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    const graph = await screen.findByTestId("implementation-graph");
    expect(within(graph).getByText(new RegExp(IMPLEMENTATION, "i"))).toBeTruthy();
    expect(within(graph).getByText(/0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc/)).toBeTruthy();
  });

  it("shows the beacon implementation for a beacon proxy", async () => {
    vi.stubGlobal("fetch", installServiceFetch(() => beaconProxyWorld));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    const summary = await screen.findByTestId("inspector-summary");
    expect(within(summary).getByText("Beacon proxy")).toBeTruthy();

    const graph = screen.getByTestId("implementation-graph");
    expect(within(graph).getAllByText(new RegExp(BEACON_IMPL, "i")).length).toBeGreaterThan(0);
  });

  it("shows the observed admin holder alongside its limitation", async () => {
    vi.stubGlobal("fetch", installServiceFetch(() => directProxyWorld));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    const table = await screen.findByTestId("authority-table");
    expect(within(table).getByText(new RegExp(ADMIN, "i"))).toBeTruthy();
    expect(within(table).getByText(/not readable from this slot/i)).toBeTruthy();
  });

  it("never presents an absent admin slot as immutability", async () => {
    vi.stubGlobal("fetch", installServiceFetch(() => uupsUnknownAuthorityWorld));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    const table = await screen.findByTestId("authority-table");
    expect(within(table).getByText(/does not mean the contract is immutable/i)).toBeTruthy();
    expect(screen.queryByText(/immutable contract/i)).toBeNull();
  });

  it("presents conflicting slots without naming an implementation", async () => {
    vi.stubGlobal("fetch", installServiceFetch(() => conflictingSlotsWorld));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    const summary = await screen.findByTestId("inspector-summary");
    expect(within(summary).getByText("Conflicting slots")).toBeTruthy();

    const findings = screen.getByTestId("proxy-findings");
    expect(within(findings).getByText(/two standardized slots disagree/i)).toBeTruthy();
  });

  it("distinguishes an empty result from a failure", async () => {
    vi.stubGlobal("fetch", installServiceFetch(() => eoaWorld));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    const summary = await screen.findByTestId("inspector-summary");
    expect(within(summary).getByText("No contract")).toBeTruthy();
    expect(within(summary).getByText(/empty coverage/i)).toBeTruthy();
    expect(screen.queryByTestId("inspector-error")).toBeNull();
  });

  it("distinguishes an unavailable result from an empty one", async () => {
    vi.stubGlobal("fetch", installServiceFetch(() => unavailableWorld));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    const summary = await screen.findByTestId("inspector-summary");
    expect(within(summary).getByText("Unavailable")).toBeTruthy();
    expect(within(summary).getByText(/unavailable coverage/i)).toBeTruthy();
  });

  it("surfaces an endpoint error with its code", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "proxy_inspection_failed", message: "The provider did not respond." }),
    }));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    const error = await screen.findByTestId("inspector-error");
    expect(within(error).getByText(/proxy_inspection_failed/)).toBeTruthy();
    expect(within(error).getByText(/the provider did not respond/i)).toBeTruthy();
  });

  it("recovers from a network failure without leaving a stale report", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    const error = await screen.findByTestId("inspector-error");
    expect(within(error).getByText(/network_error/)).toBeTruthy();
    expect(screen.queryByTestId("inspector-summary")).toBeNull();
  });

  it("scopes the reported address to its network", async () => {
    vi.stubGlobal("fetch", installServiceFetch(() => directProxyWorld));
    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();

    const summary = await screen.findByTestId("inspector-summary");
    expect(within(summary).getByText(/chain 1/)).toBeTruthy();
  });

  it("drops a late response once a newer inspection has been requested", async () => {
    const slow = installServiceFetch(() => beaconProxyWorld, { delayMs: 40 });
    const fast = installServiceFetch(() => directProxyWorld);
    let useSlow = true;

    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => (useSlow ? slow(url, init) : fast(url, init)));

    render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();
    useSlow = false;
    submit();

    const summary = await screen.findByTestId("inspector-summary");
    expect(within(summary).getByText("ERC-1967 proxy")).toBeTruthy();

    // Give the slow beacon response time to land; it must not repaint.
    await new Promise((resolve) => setTimeout(resolve, 80));

    await waitFor(() => {
      expect(within(screen.getByTestId("inspector-summary")).getByText("ERC-1967 proxy")).toBeTruthy();
    });
    expect(screen.queryByText("Beacon proxy")).toBeNull();
  });

  it("discards the previous report when the account changes", async () => {
    vi.stubGlobal("fetch", installServiceFetch(() => directProxyWorld));
    const view = render(<ProxyInspector account="0xabc" network="ethereum" />);

    submit();
    await screen.findByTestId("inspector-summary");

    view.rerender(<ProxyInspector account="0xdef" network="ethereum" />);

    expect(screen.queryByTestId("inspector-summary")).toBeNull();
    expect(screen.getByTestId("inspector-idle")).toBeTruthy();
  });
});
