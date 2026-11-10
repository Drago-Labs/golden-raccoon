import { describe, expect, it } from "vitest";
import {
  buildCallTree,
  collectTransfersAndSummarize,
  type RawInvocationMeta,
} from "@/server/research/call-tree";
import nestedCall from "./data/nested-call.json";

describe("collectTransfersAndSummarize", () => {
  it("summarizes net token movements across addresses", () => {
    const meta = nestedCall as unknown as RawInvocationMeta;
    const roots = buildCallTree(meta, meta.events);
    const { transfers, netMovements } = collectTransfersAndSummarize(roots);
    expect(transfers).toHaveLength(1);
    expect(netMovements).toEqual([
      {
        address: "GUSER",
        tokenContractId: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB6S2",
        symbol: "USDC",
        netDeltaRaw: "-50000000",
      },
      {
        address: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
        tokenContractId: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB6S2",
        symbol: "USDC",
        netDeltaRaw: "50000000",
      },
    ]);
  });
});
