import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClaimVerifier } from "@/components/research/merkle-claims/ClaimVerifier";
import { distributorAddress, wallet } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x9999999999999999999999999999999999999999" }));
vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: true }),
}));

const claimAddress = `0x${"a".repeat(40)}`;

const eligibleResult = {
  network: "ethereum",
  distributorAddress,
  claimAddress,
  state: "complete",
  onChainRoot: `0x${"1".repeat(64)}`,
  token: "0x2222222222222222222222222222222222222222",
  tree: { loaded: true, source: "https://example.com/tree.json", fileReportedRoot: `0x${"1".repeat(64)}`, entryIndex: 0, entryAmount: "100", proofLength: 1 },
  proof: { leaf: `0x${"2".repeat(64)}`, computedRoot: `0x${"1".repeat(64)}`, valid: true, reason: "proof folds up to the on-chain root" },
  claim: {
    inTree: true,
    proofValid: true,
    fileReportedRootMatchesChain: true,
    alreadyClaimed: false,
    eligible: true,
    reason: "Proof verified against the on-chain root and not yet claimed",
  },
  coverage: { onChainRootRead: true, treeLoaded: true, proofChecked: true, claimStatusRead: true },
  warnings: [],
};

async function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Distributor address"), { target: { value: distributorAddress } });
  fireEvent.change(screen.getByLabelText("Address to check"), { target: { value: claimAddress } });
  fireEvent.change(screen.getByLabelText(/Tree source/), { target: { value: "https://example.com/tree.json" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify claim" }));
}

describe("ClaimVerifier", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("exposes an accessible form, submits, and renders results by role rather than styling", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(eligibleResult), { status: 200, headers: { "content-type": "application/json" } }),
    );

    render(<ClaimVerifier />);
    await fillAndSubmit();

    await waitFor(() => expect(screen.getByRole("region", { name: "Merkle claim results" })).toBeTruthy());
    expect(screen.getByText("Eligible")).toBeTruthy();
    expect(screen.getByText("Coverage")).toBeTruthy();
  });

  it("shows 'Not eligible' with the reason when the proof is invalid", async () => {
    const invalid = {
      ...eligibleResult,
      proof: { leaf: eligibleResult.proof.leaf, computedRoot: `0x${"3".repeat(64)}`, valid: false, reason: "proof does not fold up to the on-chain root" },
      claim: { ...eligibleResult.claim, proofValid: false, eligible: false, reason: "Proof does not fold up to the on-chain root — this entry cannot be trusted" },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(invalid), { status: 200, headers: { "content-type": "application/json" } }),
    );

    render(<ClaimVerifier />);
    await fillAndSubmit();

    await waitFor(() => expect(screen.getByText("Not eligible")).toBeTruthy());
    expect(screen.getByText(/cannot be trusted/)).toBeTruthy();
  });

  it("shows an alert on failure and never renders a mutating action", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "provider_unavailable", message: "Provider rate limited" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<ClaimVerifier />);
    await fillAndSubmit();

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Provider rate limited");
    // The only button on this read-only page is the submit action itself —
    // no mutating action (sign, confirm, claim) is ever rendered.
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Verify claim"]);
  });

  it("disables submission when no wallet is connected", () => {
    walletMock.address = "";
    render(<ClaimVerifier />);
    const submitButton = screen.getByRole("button", { name: "Verify claim" }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });
});
