import { describe, expect, it } from "vitest";
import { SettlementLedger, SettlementConflictError } from "@/server/x402/settlement/ledger";
import { MemoryX402Store } from "@/server/x402/store/memory";

const createSettlementRequest = (idempotencyKey: string) => ({
  idempotencyKey,
  requestId: `req_${idempotencyKey}`,
  protectedResource: "/api/x402/deep-scan",
  requestBodyHash: "b".repeat(64),
  chainFamily: "evm" as const,
  network: "eip155:8453",
  asset: "USDC",
  amount: "0.99",
  payTo: "0x1111111111111111111111111111111111111111",
  payer: "0x2222222222222222222222222222222222222222",
  transactionHash: "0x" + "4".repeat(64),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});

describe("x402 settlement failure, owed state, and refund queries", () => {
  it("marks settled records as owed when downstream work fails and reveals them in refund queries", async () => {
    const store = new MemoryX402Store();
    const ledger = new SettlementLedger(Date.now, store);
    const req = createSettlementRequest("pay_refund_1");

    const { record: started } = await ledger.begin(req);
    expect(started.status).toBe("required");
    expect(started.owed).toBe(false);

    const verified = await ledger.reconcile("pay_refund_1", {
      chainFamily: "evm",
      network: "eip155:8453",
      asset: "USDC",
      amount: "0.99",
      transactionHash: req.transactionHash,
    });
    expect(verified.status).toBe("verified");

    const failed = await ledger.recordWorkFailure("pay_refund_1", "Analysis engine timeout during risk evaluation");
    expect(failed.status).toBe("owed");
    expect(failed.owed).toBe(true);
    expect(failed.failureReason).toBe("Analysis engine timeout during risk evaluation");

    const owedList = ledger.listOwed();
    expect(owedList).toHaveLength(1);
    expect(owedList[0].idempotencyKey).toBe("pay_refund_1");
    expect(owedList[0].owed).toBe(true);

    const refunded = await ledger.refund("pay_refund_1");
    expect(refunded.status).toBe("refunded");

    const owedAfterRefund = ledger.listOwed();
    expect(owedAfterRefund).toHaveLength(0);

    await expect(ledger.transition("pay_refund_1", "served")).rejects.toBeInstanceOf(SettlementConflictError);
  });

  it("handles multiple owed records across different payers correctly", async () => {
    const store = new MemoryX402Store();
    const ledger = new SettlementLedger(Date.now, store);

    const req1 = createSettlementRequest("pay_multi_1");
    const req2 = createSettlementRequest("pay_multi_2");

    await ledger.begin(req1);
    await ledger.begin(req2);

    await ledger.reconcile("pay_multi_1", {
      chainFamily: "evm",
      network: "eip155:8453",
      asset: "USDC",
      amount: "0.99",
      transactionHash: req1.transactionHash,
    });
    await ledger.reconcile("pay_multi_2", {
      chainFamily: "evm",
      network: "eip155:8453",
      asset: "USDC",
      amount: "0.99",
      transactionHash: req2.transactionHash,
    });

    await ledger.recordWorkFailure("pay_multi_1", "Scanner OOM");
    await ledger.bindWork("pay_multi_2", { receiptId: "rcpt_success" });

    const owedList = ledger.listOwed();
    expect(owedList).toHaveLength(1);
    expect(owedList[0].idempotencyKey).toBe("pay_multi_1");
  });
});
