import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermitInspector } from "@/components/research/permit-inspector/PermitInspector";
import { owner, token, wallet } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x9999999999999999999999999999999999999999" }));
vi.mock("@/hooks/useWalletSession", () => ({ useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: true }) }));

describe("PermitInspector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("labels every control so the flow is reachable by keyboard", () => {
    render(<PermitInspector />);
    expect(screen.getByLabelText("Network")).toBeTruthy();
    expect(screen.getByLabelText("Token address")).toBeTruthy();
    expect(screen.getByLabelText("Owner address")).toBeTruthy();
    expect(screen.getByLabelText("Spender address (optional, for Permit2)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Read permit evidence" })).toBeTruthy();
  });

  it("renders EIP-2612 evidence by role and label, and never accepts a signature input", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          network: "ethereum",
          chainId: 1,
          blockNumber: 100,
          tokenAddress: token,
          ownerAddress: owner,
          state: "complete",
          eip2612: { supported: true, name: "Example Token", version: "1", domainSeparator: "0xabc", nonce: "3" },
          permit2: null,
          warnings: ["No spender was supplied: Permit2 exposure for this token was not checked."],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<PermitInspector />);
    fireEvent.change(screen.getByLabelText("Token address"), { target: { value: token } });
    fireEvent.change(screen.getByLabelText("Owner address"), { target: { value: owner } });
    fireEvent.click(screen.getByRole("button", { name: "Read permit evidence" }));

    await waitFor(() => expect(screen.getByText("Example Token")).toBeTruthy());
    expect(screen.getByText("Not checked — supply a spender address to look up Permit2.")).toBeTruthy();
    expect(screen.queryByLabelText(/signature|private key|seed phrase/i)).toBeNull();
  });

  it("shows an alert on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "provider_unavailable", message: "Provider rate limited" }), { status: 503, headers: { "content-type": "application/json" } }));
    render(<PermitInspector />);
    fireEvent.change(screen.getByLabelText("Token address"), { target: { value: token } });
    fireEvent.change(screen.getByLabelText("Owner address"), { target: { value: owner } });
    fireEvent.click(screen.getByRole("button", { name: "Read permit evidence" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Provider rate limited"));
  });
});
