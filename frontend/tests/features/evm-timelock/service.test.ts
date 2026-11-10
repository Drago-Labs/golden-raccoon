import { describe, expect, it } from "vitest";
import { inspectEvmTimelock, type RecordedTimelockSnapshot } from "@/server/research/evm-timelock";
import { recordedTimelockReader, timelockAddress, wallet } from "./fixtures";
import pendingOps from "./data/pending-operations.json";
import openExec from "./data/open-executor.json";

const baseRequest = {
  walletAddress: wallet,
  network: "ethereum",
  walletNetwork: "ethereum",
  timelockAddress,
};

describe("inspectEvmTimelock", () => {
  it("decodes pending operations and reports complete state", async () => {
    const res = await inspectEvmTimelock(baseRequest, {
      reader: recordedTimelockReader(pendingOps as RecordedTimelockSnapshot),
    });
    expect(res.state).toBe("complete");
    expect(res.operations[0]!.status).toBe("pending");
    expect(res.operations[0]!.calls[0]!.functionName).toBe("transfer");
  });

  it("surfaces warnings for open executor and EOA admins", async () => {
    const res = await inspectEvmTimelock(baseRequest, {
      reader: recordedTimelockReader(openExec as RecordedTimelockSnapshot),
    });
    expect(res.roles.openExecutor).toBe(true);
    expect(res.warnings.some((w) => w.includes("Open executor"))).toBe(true);
  });

  it("returns unavailable when reader fails", async () => {
    const res = await inspectEvmTimelock(baseRequest, {
      reader: {
        async readTimelockSnapshot() {
          throw new Error("RPC unreachable");
        },
      },
    });
    expect(res.state).toBe("unavailable");
  });
});
