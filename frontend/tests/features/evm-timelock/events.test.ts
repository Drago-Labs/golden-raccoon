import { describe, expect, it } from "vitest";
import { groupTimelockOperations, type TimelockEventLog } from "@/server/research/evm-timelock";
import batched from "./data/batched-operation.json";

describe("groupTimelockOperations", () => {
  it("preserves call index order inside batched operations", () => {
    const ops = groupTimelockOperations(batched.events as TimelockEventLog[], batched.recordedTimestamp);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.calls.map((c) => c.index)).toEqual([0, 1]);
  });
});
