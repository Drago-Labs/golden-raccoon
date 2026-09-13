import { describe, expect, it } from "vitest";
import { allowanceInventoryRequestSchema, buildCoverage, mergeCandidates } from "@/server/research/allowance-inventory";
import { finiteToken, spenderA, walletA } from "./fixtures";

describe("allowance inventory validation", () => {
  it("rejects arbitrary networks, invalid owners and unbounded explicit ranges", () => {
    expect(allowanceInventoryRequestSchema.safeParse({ walletAddress: walletA, network: "custom", fromBlock: "1", toBlock: "2" }).success).toBe(false);
    expect(allowanceInventoryRequestSchema.safeParse({ walletAddress: "0xbad", network: "ethereum", fromBlock: "1", toBlock: "2" }).success).toBe(false);
    expect(allowanceInventoryRequestSchema.safeParse({ walletAddress: walletA, network: "ethereum", fromBlock: "1", toBlock: "20000" }).success).toBe(false);
  });

  it("deduplicates canonical candidate identities without losing provenance", () => {
    expect(mergeCandidates([{ token: finiteToken.toUpperCase().replace("0X", "0x"), spender: spenderA }], [{ token: finiteToken, spender: spenderA }])).toEqual([{ token: finiteToken, spender: spenderA, source: "both" }]);
  });

  it("distinguishes valid empty, partial and unavailable coverage", () => {
    const base = { fromBlock: "1", toBlock: "2", snapshotBlock: "2", candidateCount: 0, successfulReads: 0, skippedCalls: 0, logCoverageComplete: true, reorgDetected: false, providerLimitations: [], unsupportedStandards: [] };
    expect(buildCoverage(base).state).toBe("complete");
    expect(buildCoverage({ ...base, logCoverageComplete: false }).state).toBe("partial");
    expect(buildCoverage({ ...base, snapshotBlock: null }).state).toBe("unavailable");
  });
});
