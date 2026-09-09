import { describe, expect, it } from "vitest";
import type { X402ChainFamily } from "@/server/types";
import {
  UniversalSettlementContract,
  type SettlementContract,
} from "@/server/x402/settlement/contract";
import { SettlementLedger } from "@/server/x402/settlement/ledger";
import { ProofConsumer, ProofAlreadyConsumedError } from "@/server/x402/settlement/consume";
import { ReceiptManager } from "@/server/x402/settlement/receipts";
import { PricingEngine } from "@/server/x402/metering/pricing";
import { UsageTracker } from "@/server/x402/metering/usage";
import { QuotaEnforcer } from "@/server/x402/metering/quota";
import { MemoryX402Store } from "@/server/x402/store/memory";

function buildSuite(chainFamily: X402ChainFamily) {
  const store = new MemoryX402Store();
  const ledger = new SettlementLedger(Date.now, store);
  const consumer = new ProofConsumer(store);
  const receipts = new ReceiptManager(store, "test-secret");
  const pricing = new PricingEngine(store);
  const usage = new UsageTracker(store, ledger);
  const quota = new QuotaEnforcer(store, {
    defaultPolicy: {
      maxRequestsPerWindow: 100,
      maxSpendPerWindow: 50,
      windowSeconds: 3600,
    },
  });

  const contract: SettlementContract = new UniversalSettlementContract(
    chainFamily,
    ledger,
    consumer,
    receipts,
    pricing,
    usage,
    quota,
    store,
  );

  const sampleNetwork = chainFamily === "evm" ? "eip155:8453" : "stellar:testnet";
  const sampleAsset = chainFamily === "evm" ? "USDC" : "USDC:stellar";
  const samplePayTo =
    chainFamily === "evm"
      ? "0x1111111111111111111111111111111111111111"
      : "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAA";
  const samplePayer =
    chainFamily === "evm"
      ? "0x2222222222222222222222222222222222222222"
      : "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
  const sampleTxHash =
    chainFamily === "evm" ? "0x" + "5".repeat(64) : "6".repeat(64);

  return {
    contract,
    store,
    ledger,
    consumer,
    receipts,
    pricing,
    usage,
    quota,
    sampleNetwork,
    sampleAsset,
    samplePayTo,
    samplePayer,
    sampleTxHash,
  };
}

describe.each(["evm", "stellar"] as const)(
  "unified settlement contract suite for chain family: %s",
  (chainFamily) => {
    it("completes full happy path: begin -> consume -> deliver work -> redeem receipt", async () => {
      const {
        contract,
        sampleNetwork,
        sampleAsset,
        samplePayTo,
        samplePayer,
        sampleTxHash,
      } = buildSuite(chainFamily);

      const idempotencyKey = `idemp_${chainFamily}_1`;
      const beginResult = await contract.begin({
        idempotencyKey,
        requestId: `req_${chainFamily}_1`,
        protectedResource: "/api/x402/deep-scan",
        requestBodyHash: "c".repeat(64),
        chainFamily,
        network: sampleNetwork,
        asset: sampleAsset,
        amount: "0.99",
        payTo: samplePayTo,
        payer: samplePayer,
        transactionHash: sampleTxHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

      expect(beginResult.idempotent).toBe(false);
      expect(beginResult.record.status).toBe("required");

      const proofString = `proof_token_${chainFamily}_12345`;
      await contract.consumeProof(proofString, beginResult.record.id);

      await expect(
        contract.consumeProof(proofString, beginResult.record.id),
      ).rejects.toBeInstanceOf(ProofAlreadyConsumedError);

      const delivered = await contract.deliverWork(
        idempotencyKey,
        "/api/x402/deep-scan",
        { score: 98, status: "secure" },
        samplePayer,
      );

      expect(delivered.record.status).toBe("served");
      expect(delivered.receipt.id).toBeTruthy();
      expect(delivered.receipt.resultHash).toBeTruthy();

      const redeemed = await contract.redeemReceipt(
        delivered.receipt.id,
        "/api/x402/deep-scan",
      );

      expect(redeemed.receipt.id).toBe(delivered.receipt.id);
      expect(redeemed.result).toEqual({ score: 98, status: "secure" });
    });

    it("handles failure and refund lifecycle identically", async () => {
      const {
        contract,
        sampleNetwork,
        sampleAsset,
        samplePayTo,
        samplePayer,
        sampleTxHash,
      } = buildSuite(chainFamily);

      const idempotencyKey = `idemp_fail_${chainFamily}`;
      await contract.begin({
        idempotencyKey,
        requestId: `req_fail_${chainFamily}`,
        protectedResource: "/api/x402/deep-scan",
        requestBodyHash: "d".repeat(64),
        chainFamily,
        network: sampleNetwork,
        asset: sampleAsset,
        amount: "0.99",
        payTo: samplePayTo,
        payer: samplePayer,
        transactionHash: sampleTxHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

      const failedRecord = await contract.recordWorkFailure(
        idempotencyKey,
        "Deep scan worker timed out",
      );

      expect(failedRecord.status).toBe("owed");
      expect(failedRecord.owed).toBe(true);

      const owedRefunds = await contract.getOwedRefunds();
      expect(owedRefunds.some((r) => r.idempotencyKey === idempotencyKey)).toBe(true);

      const refunded = await contract.processRefund(idempotencyKey);
      expect(refunded.status).toBe("refunded");

      const owedAfterRefund = await contract.getOwedRefunds();
      expect(owedAfterRefund.some((r) => r.idempotencyKey === idempotencyKey)).toBe(false);
    });

    it("enforces price quote locking during begin", async () => {
      const {
        contract,
        pricing,
        sampleNetwork,
        sampleAsset,
        samplePayTo,
        samplePayer,
        sampleTxHash,
      } = buildSuite(chainFamily);

      const quote = await pricing.issueQuote({
        resource: "/api/x402/deep-scan",
        priceUsd: "$0.99",
        chainFamily,
        network: sampleNetwork,
        asset: sampleAsset,
        payTo: samplePayTo,
        ttlSeconds: 300,
      });

      const result = await contract.begin(
        {
          idempotencyKey: `idemp_quote_${chainFamily}`,
          requestId: `req_quote_${chainFamily}`,
          protectedResource: "/api/x402/deep-scan",
          requestBodyHash: "e".repeat(64),
          chainFamily,
          network: sampleNetwork,
          asset: sampleAsset,
          amount: "0.99",
          payTo: samplePayTo,
          payer: samplePayer,
          transactionHash: sampleTxHash,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        quote.id,
      );

      expect(result.record.priceQuoted).toBe("$0.99");
    });
  },
);
