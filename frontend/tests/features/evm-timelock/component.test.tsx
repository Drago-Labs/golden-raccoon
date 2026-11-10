import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TimelockInspector } from "@/components/research/evm-timelock/TimelockInspector";
import { timelockAddress, wallet } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x9999999999999999999999999999999999999999" }));
vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: Boolean(walletMock.address) }),
}));

const sampleResult = {
  network: "ethereum",
  timelockAddress,
  recordedBlock: 19000000,
  recordedTimestamp: 1700001000,
  minDelaySeconds: 86400,
  state: "complete",
  operations: [
    {
      operationId: "0xop1",
      status: "pending",
      scheduledAtTimestamp: 1700000000,
      readyAtTimestamp: 1700086400,
      delaySeconds: 86400,
      predecessor: "0x0",
      calls: [
        {
          index: 0,
          target: "0x1111111111111111111111111111111111111111",
          valueWei: "0",
          rawData: "0xa9059cbb",
          selector: "0xa9059cbb",
          functionName: "transfer",
          args: ["0x2222222222222222222222222222222222222222", "1000"],
          decoded: true,
        },
      ],
    },
  ],
  roles: {
    proposers: [],
    executors: [],
    cancellers: [],
    admins: [],
    openExecutor: false,
    eoaAdmins: [],
  },
  coverage: {
    reachedProvider: true,
    recordedBlock: 19000000,
    recordedTimestamp: 1700001000,
    eventsRead: 1,
    operationsGrouped: 1,
    callsDecoded: 1,
    callsTotal: 1,
  },
  warnings: [],
};

describe("TimelockInspector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("submits and renders operations, decoded calls, and coverage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(sampleResult), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<TimelockInspector />);
    fireEvent.change(screen.getByLabelText("Timelock address"), { target: { value: timelockAddress } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect timelock" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Timelock inspection results" })).toBeTruthy());
    expect(screen.getByText("0xop1")).toBeTruthy();
    expect(screen.getByText("Coverage")).toBeTruthy();
  });
});
