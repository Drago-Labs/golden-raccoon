import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SigningInspector } from "@/components/research/signing-inspector/SigningInspector";
import { SigningInspectorError } from "@/server/research/signing-inspector/schema";
import { inspectSigningPayload } from "@/server/research/signing-inspector/service";
import {
  MALFORMED_XDR,
  MULTI_OPERATION_XDR,
  OWNER,
  SPENDER,
  STELLAR_DESTINATION,
  TRANSFER,
  UNKNOWN_SELECTOR_CALLDATA,
  UNLIMITED_APPROVE,
  UNLIMITED_PERMIT,
  WRONG_CHAIN_PERMIT,
} from "./fixtures";

/**
 * Routes the component's fetch through the real service, so the component test
 * renders the same report shape the endpoint returns.
 */
function installServiceFetch(options: { delayMs?: number } = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const report = inspectSigningPayload(JSON.parse(String(init?.body ?? "{}")));

      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as SigningInspectorError;

      return {
        ok: false,
        status: 400,
        json: async () => ({ error: failure.code ?? "signing_inspection_failed", message: failure.message }),
      } as unknown as Response;
    }
  });
}

function decode(payload: string, kind?: "evm_calldata" | "evm_typed_data" | "stellar_envelope", expectedAccount?: string) {
  if (kind) {
    fireEvent.change(screen.getByLabelText(/payload kind/i), { target: { value: kind } });
  }

  if (expectedAccount) {
    fireEvent.change(screen.getByLabelText(/account you expect/i), { target: { value: expectedAccount } });
  }

  fireEvent.change(screen.getByLabelText(/unsigned payload/i), { target: { value: payload } });
  fireEvent.submit(screen.getByRole("form", { name: /signing payload/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SigningInspector", () => {
  it("starts in an idle state that promises no signature and no chain call", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="ethereum" />);

    expect(screen.getByTestId("signing-idle").textContent).toMatch(/nothing is signed, submitted or stored/i);
  });

  it("warns against pasting a secret and offers no field for one", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="ethereum" />);

    expect(screen.getByText(/never paste a private key or seed phrase/i)).toBeTruthy();
    expect(screen.queryByLabelText(/private key|seed phrase|mnemonic/i)).toBeNull();
  });

  it("labels every control so the flow is reachable by keyboard", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="ethereum" />);

    expect(screen.getByLabelText(/payload kind/i)).toBeTruthy();
    expect(screen.getByLabelText(/unsigned payload/i)).toBeTruthy();
    expect(screen.getByLabelText(/account you expect/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /decode/i })).toBeTruthy();
  });

  it("refuses an empty payload before issuing a request", async () => {
    const fetchMock = installServiceFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<SigningInspector account={OWNER} network="ethereum" />);

    fireEvent.submit(screen.getByRole("form", { name: /signing payload/i }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an unlimited approval as unlimited, in plain language", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="ethereum" />);

    decode(UNLIMITED_APPROVE);

    const permissions = await screen.findByTestId("permission-summary");
    expect(within(permissions).getByText("Unlimited")).toBeTruthy();
    expect(within(permissions).getByText(/entire balance/i)).toBeTruthy();
    expect(within(permissions).getByText(new RegExp(SPENDER, "i"))).toBeTruthy();
  });

  it("always renders the decoding-is-not-approval caveat with a result", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="ethereum" />);

    decode(TRANSFER);

    const summary = await screen.findByTestId("signing-summary");
    expect(within(summary).getByText(/decoding is not approval/i)).toBeTruthy();
  });

  it("shows an unrecognized selector as unrecognized rather than hiding it", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="ethereum" />);

    decode(UNKNOWN_SELECTOR_CALLDATA);

    const unknown = await screen.findByTestId("unknown-fields");
    expect(within(unknown).getByText(/will not guess what it does/i)).toBeTruthy();
    expect(screen.getByTestId("permissions-empty")).toBeTruthy();
  });

  it("flags a permit whose domain names a different chain", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="ethereum" />);

    decode(JSON.stringify(WRONG_CHAIN_PERMIT), "evm_typed_data");

    const binding = await screen.findByTestId("context-binding");
    expect(within(binding).getAllByText("Mismatch").length).toBeGreaterThan(0);
  });

  it("reports a contract expectation as unbound when the calldata names no target", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="ethereum" />);

    decode(TRANSFER);

    const binding = await screen.findByTestId("context-binding");
    expect(within(binding).getAllByText("Not bound").length).toBeGreaterThan(0);
  });

  it("checks the chain the user says they expect", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="ethereum" />);

    fireEvent.change(screen.getByLabelText(/chain id/i), { target: { value: "137" } });
    decode(TRANSFER);

    const binding = await screen.findByTestId("context-binding");
    expect(within(binding).getAllByText("Matches").length).toBeGreaterThan(0);
  });

  it("offers a Stellar network choice instead of a chain id for an envelope", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="stellar" />);

    fireEvent.change(screen.getByLabelText(/payload kind/i), { target: { value: "stellar_envelope" } });

    expect(screen.getByLabelText(/stellar network/i)).toBeTruthy();
    expect(screen.queryByLabelText(/chain id/i)).toBeNull();
  });

  it("states that an envelope is bound to no network, rather than echoing the user's choice back", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="stellar" />);

    decode(MULTI_OPERATION_XDR, "stellar_envelope");

    const binding = await screen.findByTestId("context-binding");
    expect(within(binding).getAllByText("Not bound").length).toBeGreaterThan(0);
    expect(within(binding).getByText(/nothing binds this envelope to the network you expect/i)).toBeTruthy();
  });

  it("lists every Stellar operation, including one it does not interpret", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="stellar" />);

    decode(MULTI_OPERATION_XDR, "stellar_envelope");

    const operations = await screen.findByTestId("operation-list");
    expect(within(operations).getByText("bumpSequence")).toBeTruthy();
    expect(within(operations).getByText("Not interpreted")).toBeTruthy();
    expect(within(operations).getAllByText(new RegExp(STELLAR_DESTINATION)).length).toBeGreaterThan(0);
  });

  it("puts the operation that hands over account control first", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="stellar" />);

    decode(MULTI_OPERATION_XDR, "stellar_envelope");

    const permissions = await screen.findByTestId("permission-summary");
    expect(within(permissions.querySelectorAll("li")[0] as HTMLElement).getByText("Account change")).toBeTruthy();
  });

  it("surfaces a malformed envelope as an error with its code", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="stellar" />);

    decode(MALFORMED_XDR, "stellar_envelope");

    const error = await screen.findByTestId("signing-error");
    expect(within(error).getByText(/malformed_envelope/)).toBeTruthy();
  });

  it("rejects typed data that is not JSON without issuing a request", async () => {
    const fetchMock = installServiceFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<SigningInspector account={OWNER} network="ethereum" />);

    decode("{not json", "evm_typed_data");

    const error = await screen.findByTestId("signing-error");
    expect(within(error).getByText(/invalid_json/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recovers from a transport failure without leaving a stale report", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    render(<SigningInspector account={OWNER} network="ethereum" />);

    decode(TRANSFER);

    const error = await screen.findByTestId("signing-error");
    expect(within(error).getByText(/network_error/)).toBeTruthy();
    expect(screen.queryByTestId("signing-summary")).toBeNull();
  });

  it("drops a late response once a newer payload has been submitted", async () => {
    const slow = installServiceFetch({ delayMs: 40 });
    const fast = installServiceFetch();
    let useSlow = true;

    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => (useSlow ? slow(url, init) : fast(url, init)));
    render(<SigningInspector account={OWNER} network="ethereum" />);

    decode(UNLIMITED_APPROVE);
    useSlow = false;
    decode(TRANSFER);

    const permissions = await screen.findByTestId("permission-summary");
    expect(within(permissions).getByText("Transfer")).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 80));

    await waitFor(() => {
      expect(within(screen.getByTestId("permission-summary")).getByText("Transfer")).toBeTruthy();
    });
    expect(screen.queryByText("Unlimited")).toBeNull();
  });

  it("discards the decoded payload when the account changes", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    const view = render(<SigningInspector account={OWNER} network="ethereum" />);

    decode(UNLIMITED_APPROVE);
    await screen.findByTestId("signing-summary");

    view.rerender(<SigningInspector account={SPENDER} network="ethereum" />);

    expect(screen.queryByTestId("signing-summary")).toBeNull();
    expect(screen.getByTestId("signing-idle")).toBeTruthy();
    expect((screen.getByLabelText(/unsigned payload/i) as HTMLTextAreaElement).value).toBe("");
  });

  it("decodes an ERC-2612 permit and says no transaction is needed", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<SigningInspector account={OWNER} network="ethereum" />);

    decode(JSON.stringify(UNLIMITED_PERMIT), "evm_typed_data");

    const permissions = await screen.findByTestId("permission-summary");
    expect(within(permissions).getByText("Permit")).toBeTruthy();
    expect(within(permissions).getByText(/no transaction from you/i)).toBeTruthy();
  });
});
