import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnsVerifier } from "@/components/research/ens-resolution/EnsVerifier";
import { wallet } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x9999999999999999999999999999999999999999" }));
vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: Boolean(walletMock.address) }),
}));

const sampleResult = {
  network: "ethereum",
  state: "complete",
  classification: "verified",
  normalizedName: "alice.eth",
  confusables: { label: "alice.eth", mixedScripts: false, zeroWidthCharacters: false, flaggedCharacters: [] },
  forward: {
    normalizedName: "alice.eth",
    registryResolver: "0x231b0ee14048e9dCcD1d247744d114a4EB5E8E63",
    forwardAddress: "0x1111111111111111111111111111111111111111",
    blockNumber: 19500000,
  },
  reverse: {
    queriedAddress: "0x1111111111111111111111111111111111111111",
    reverseName: "alice.eth",
    reverseForwardAddress: "0x1111111111111111111111111111111111111111",
    blockNumber: 19500000,
  },
  ownership: {
    registrant: "0x1111111111111111111111111111111111111111",
    controller: "0x1111111111111111111111111111111111111111",
    nameWrapperWrapped: true,
    expiresAtTimestamp: 1800000000,
    expiredAtRecordedTime: false,
  },
  coverage: { reachedProvider: true, recordedBlock: 19500000, forwardResolved: true, reverseResolved: true, ownershipRead: true },
  warnings: [],
};

describe("EnsVerifier", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("submits and renders resolution steps, ownership, and coverage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(sampleResult), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<EnsVerifier />);
    fireEvent.change(screen.getByLabelText("ENS name"), { target: { value: "alice.eth" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify ENS resolution" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "ENS resolution results" })).toBeTruthy());
    expect(screen.getByText(/Resolution steps \(verified\)/i)).toBeTruthy();
    expect(screen.getByText("Coverage")).toBeTruthy();
  });
});
