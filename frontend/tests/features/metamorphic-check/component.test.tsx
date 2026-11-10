import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetamorphicCheck } from "@/components/research/metamorphic-check/MetamorphicCheck";
import { contractAddress, wallet } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x9999999999999999999999999999999999999999" }));
vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: Boolean(walletMock.address) }),
}));

const sampleResult = {
  network: "ethereum",
  contractAddress,
  state: "complete",
  classification: "redeployable_metamorphic",
  creation: {
    found: true,
    txHash: "0xabc1",
    creationKind: "CREATE2",
    factoryAddress: "0x2222222222222222222222222222222222222222",
    salt: "0x01",
    initCodeHex: "0x60003cfa",
    deploymentBlock: 15000000,
  },
  opcodes: { hasSelfDestruct: true, selfDestructOffsets: [2], hasDelegateCall: false, delegateCallOffsets: [] },
  initCodePatterns: { externalCodeCopyInInit: true, dynamicRuntimeLoader: true },
  forkRules: { network: "ethereum", eip6780Active: false, cancunActivationBlock: 19426587, postCancunSelfDestructRestricted: false },
  codeHashHistory: { samples: [{ blockNumber: 15000000, codeHash: "0xhash1" }], historicalCodeChangeDetected: true },
  coverage: { reachedProvider: true, creationTxFound: true, runtimeBytecodeRead: true, codeHashSamplesRead: 1 },
  warnings: [],
};

describe("MetamorphicCheck", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("submits and renders deployment evidence, bytecode findings, and coverage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(sampleResult), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<MetamorphicCheck />);
    fireEvent.change(screen.getByLabelText("Contract address"), { target: { value: contractAddress } });
    fireEvent.click(screen.getByRole("button", { name: "Check metamorphic pattern" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Metamorphic check results" })).toBeTruthy());
    expect(screen.getByText(/redeployable_metamorphic/i)).toBeTruthy();
    expect(screen.getByText("Coverage")).toBeTruthy();
  });
});
