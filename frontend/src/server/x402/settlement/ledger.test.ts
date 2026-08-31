import { describe, expect, it } from "vitest";
import { SettlementConflictError, SettlementLedger } from "@/server/x402/settlement/ledger";

const request = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: "payment-1",
  requestId: "request-1",
  protectedResource: "/premium",
  requestBodyHash: "a".repeat(64),
  chainFamily: "evm" as const,
  network: "eip155:84532",
  asset: "USDC",
  amount: "0.99",
  payTo: "0x1111111111111111111111111111111111111111",
  payer: "0x2222222222222222222222222222222222222222",
  transactionHash: "0x" + "3".repeat(64),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  ...overrides,
});

describe("x402 settlement ledger", () => {
  it("is idempotent and atomic for concurrent begins", async () => {
    const ledger = new SettlementLedger();
    const [first, second] = await Promise.all([ledger.begin(request()), ledger.begin(request())]);
    expect(first.record.id).toBe(second.record.id);
    expect([first.idempotent, second.idempotent].sort()).toEqual([false, true]);
    expect(ledger.list()).toHaveLength(1);
  });

  it("rejects idempotency reuse with a changed payment binding", async () => {
    const ledger = new SettlementLedger();
    await ledger.begin(request());
    await expect(ledger.begin(request({ amount: "1.00" }))).rejects.toBeInstanceOf(SettlementConflictError);
  });

  it("reconciles exact chain/asset/amount and redacts payer identity", async () => {
    const ledger = new SettlementLedger();
    const started = await ledger.begin(request());
    expect(JSON.stringify(started.record)).not.toContain("0x2222222222222222222222222222222222222222");
    expect(started.record.payerRedacted).toBe("0x2222...2222");
    const verified = await ledger.reconcile("payment-1", { chainFamily: "evm", network: "eip155:84532", asset: "usdc", amount: "0.99", transactionHash: request().transactionHash });
    expect(verified.status).toBe("verified");
    await expect(ledger.reconcile("payment-1", { chainFamily: "evm", network: "eip155:1", asset: "USDC", amount: "0.99" })).rejects.toBeInstanceOf(SettlementConflictError);
  });

  it("enforces lifecycle transitions and expires required records", async () => {
    let now = Date.now();
    const ledger = new SettlementLedger(() => now);
    await ledger.begin(request({ expiresAt: new Date(now + 1).toISOString() }));
    now += 10;
    expect((await ledger.expireDue()).map((record) => record.status)).toEqual(["expired"]);
    await expect(ledger.transition("payment-1", "served")).rejects.toBeInstanceOf(SettlementConflictError);
  });
});
