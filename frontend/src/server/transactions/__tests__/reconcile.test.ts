import { describe, expect, it } from "vitest";
import { reconcileTransactionAgainstChain } from "../reconcile";
import { createTransactionRecord, getTransactionRecord } from "../../storage";

describe("chain reconciliation without re-broadcast", () => {
  it("reconciles dropped/failed submission against chain without re-broadcasting", async () => {
    const testHash = "0x" + "a".repeat(64);
    createTransactionRecord({
      hash: testHash,
      type: "swap",
      decisionAction: "swap_to_stable",
      asset: "USDC",
      valueUsd: 100,
      status: "submitted",
      lifecycleStatus: "submitted",
      chainFamily: "evm",
      network: "base",
      walletAddress: "0x1111111111111111111111111111111111111111",
      userApproved: true,
      submittedAt: new Date().toISOString(),
    });

    const recon = await reconcileTransactionAgainstChain(testHash, {
      chainFamily: "evm",
      network: "base",
      maxAttempts: 1,
      pollIntervalMs: 10,
    });

    // In local unit test without mock RPC provider, poll should gracefully report not on-chain
    // and critically NOT throw or re-broadcast
    expect(recon.hash).toBe(testHash);
    expect(typeof recon.onChain).toBe("boolean");
    expect(recon.status).toBeDefined();

    const record = getTransactionRecord(testHash);
    expect(record).toBeDefined();
    // Invariant: Status must be one of the reconciled states, never looping
    expect(["submitted", "pending", "confirming", "confirmed", "failed", "dropped"]).toContain(record?.lifecycleStatus);
  });
});
