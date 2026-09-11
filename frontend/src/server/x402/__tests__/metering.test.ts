import { describe, expect, it } from "vitest";
import { MemoryX402Store } from "@/server/x402/store/memory";
import { UsageTracker } from "@/server/x402/metering/usage";
import { QuotaEnforcer } from "@/server/x402/metering/quota";
import { SettlementLedger } from "@/server/x402/settlement/ledger";

describe("x402 metering, entitlements, and usage reconciliation", () => {
  it("tracks payer usage and enforces request and spend quotas", async () => {
    const store = new MemoryX402Store();
    const ledger = new SettlementLedger(Date.now, store);
    const quota = new QuotaEnforcer(store, {
      defaultPolicy: {
        maxRequestsPerWindow: 2,
        maxSpendPerWindow: 2.0,
        windowSeconds: 300,
      },
    });

    const payer = "0x3333333333333333333333333333333333333333";

    const check1 = await quota.checkQuota(payer, "evm", 0.99);
    expect(check1.allowed).toBe(true);

    await quota.consume(payer, "evm", 0.99);

    const check2 = await quota.checkQuota(payer, "evm", 0.99);
    expect(check2.allowed).toBe(true);

    await quota.consume(payer, "evm", 0.99);

    const check3 = await quota.checkQuota(payer, "evm", 0.99);
    expect(check3.allowed).toBe(false);
    expect(check3.reason).toContain("Quota exceeded");
  });

  it("reconciles usage tracker totals against settled ledger records", async () => {
    const store = new MemoryX402Store();
    const ledger = new SettlementLedger(Date.now, store);
    const usage = new UsageTracker(store, ledger);

    const payer = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAA";

    await usage.recordSettlementUsage(payer, "stellar", {
      amount: "0.99",
      canonicalAsset: "stellar:testnet:USDC",
      success: true,
    });

    await ledger.begin({
      idempotencyKey: "reconcile_test_1",
      requestId: "req_rec_1",
      protectedResource: "/api/x402/deep-scan",
      requestBodyHash: "f".repeat(64),
      chainFamily: "stellar",
      network: "stellar:testnet",
      asset: "USDC",
      amount: "0.99",
      payTo: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      payer,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await ledger.bindWork("reconcile_test_1", { receiptId: "rcpt_rec_1" });

    const report = await usage.reconcileWithLedger(payer, "stellar");
    expect(report.discrepancy).toBe(false);
    expect(report.meteredCount).toBe(1);
    expect(report.ledgerCount).toBe(1);
  });

  it("detects discrepancies when metered usage does not match ledger settlements", async () => {
    const store = new MemoryX402Store();
    const ledger = new SettlementLedger(Date.now, store);
    const usage = new UsageTracker(store, ledger);

    const payer = "0x4444444444444444444444444444444444444444";

    await usage.recordSettlementUsage(payer, "evm", {
      amount: "5.00",
      canonicalAsset: "evm:eip155:8453:usdc",
      success: true,
    });

    const report = await usage.reconcileWithLedger(payer, "evm");
    expect(report.discrepancy).toBe(true);
    expect(report.meteredTotal).toBe(5.0);
    expect(report.ledgerTotal).toBe(0);
  });
});
