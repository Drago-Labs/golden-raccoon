import assert from "node:assert/strict";
import {
  IdempotencyStore,
  IdempotencyPayloadMismatchError,
  computePayloadFingerprint,
  globalIdempotencyStore,
} from "../src/server/transactions/idempotency";
import {
  createQuoteBinding,
  verifyQuoteBinding,
  computeQuoteHash,
} from "../src/server/providers/quote/binding";
import {
  configureEvmSimulator,
  clearEvmSimulator,
  getEvmChainAdapter,
} from "../src/server/transactions/adapters/evm";
import {
  configureStellarSimulator,
  clearStellarSimulator,
  getStellarChainAdapter,
} from "../src/server/transactions/adapters/stellar";
import { reconcileTransactionAgainstChain } from "../src/server/transactions/reconcile";
import { createTransactionRecord, getTransactionRecord } from "../src/server/storage";

async function testIdempotencyCore() {
  const store = new IdempotencyStore();
  const key = "test-check-key-1";
  const wallet = "0x1234567890123456789012345678901234567890";
  const payload = { from: "ETH", to: "USDC", amount: "1.5" };
  const fp = computePayloadFingerprint(payload);

  // 1. Initial acquisition
  const gate1 = await store.acquireOrWait(key, wallet, fp);
  assert.equal(gate1.isReplay, false, "Initial acquire must not be replay");

  // 2. Resolve outcome
  const mockOutcome = { hash: "0x" + "b".repeat(64), status: "submitted" };
  store.resolveKey(key, mockOutcome);

  // 3. Replay with identical payload returns stored outcome with isReplay: true
  const gate2 = await store.acquireOrWait(key, wallet, fp);
  assert.equal(gate2.isReplay, true, "Replay must be detected");
  assert.deepEqual(gate2.outcome, mockOutcome, "Outcome must match cached result");

  // 4. Replay with altered payload throws 409 mismatch
  const mutatedPayload = { from: "ETH", to: "USDC", amount: "2.0" };
  const mutatedFp = computePayloadFingerprint(mutatedPayload);

  let caughtError: any = null;
  try {
    await store.acquireOrWait(key, wallet, mutatedFp);
  } catch (err) {
    caughtError = err;
  }
  assert.ok(caughtError instanceof IdempotencyPayloadMismatchError, "Must throw IdempotencyPayloadMismatchError");
  assert.equal(caughtError.statusCode, 409, "Must return 409 Conflict status");
  assert.equal(caughtError.code, "idempotency_payload_mismatch");

  console.log("✓ Idempotency store acquire, replay, and 409 mismatch checks passed");
}

async function testConcurrentSubmissionSafety() {
  const store = new IdempotencyStore();
  const key = "concurrent-submission-key";
  const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const payload = { action: "swap", asset: "USDC", amount: 100 };
  const fp = computePayloadFingerprint(payload);

  let broadcastCalls = 0;

  async function simulateSubmissionWorker(workerId: number) {
    const gate = await store.acquireOrWait(key, wallet, fp);
    if (!gate.isReplay) {
      broadcastCalls += 1;
      // Simulate network / chain broadcast delay
      await new Promise((r) => setTimeout(r, 40));
      const result = { hash: "0xwinner_tx_hash", workerId, replayed: false };
      store.resolveKey(key, result);
      return result;
    }
    return { ...(gate.outcome as any), replayed: true };
  }

  // Launch 5 concurrent submissions with the same idempotency key
  const results = await Promise.all([
    simulateSubmissionWorker(1),
    simulateSubmissionWorker(2),
    simulateSubmissionWorker(3),
    simulateSubmissionWorker(4),
    simulateSubmissionWorker(5),
  ]);

  assert.equal(broadcastCalls, 1, "Exactly one worker must broadcast");
  const winners = results.filter((r) => !r.replayed);
  const losers = results.filter((r) => r.replayed);
  assert.equal(winners.length, 1, "Exactly one winner");
  assert.equal(losers.length, 4, "All losers must observe replay");
  assert.ok(losers.every((l) => l.hash === "0xwinner_tx_hash"), "All losers must receive winner's tx hash");

  console.log("✓ Concurrent submission safety (single broadcast, serialized waiters) passed");
}

async function testQuoteBindingIntegrity() {
  const quoteData = {
    chain: "evm",
    walletAddress: "0x1111111111111111111111111111111111111111",
    fromAsset: "ETH",
    toAsset: "USDC",
    inputAmount: "10.0",
    minReceiveAmount: "30000.0",
    ttlMs: 60_000,
  };

  const binding = createQuoteBinding(quoteData);
  assert.ok(binding.quoteHash, "Quote hash must be generated");
  assert.ok(binding.quoteSignature, "Quote signature must be generated");

  // Valid verification
  const validCheck = verifyQuoteBinding({
    binding,
    chain: quoteData.chain,
    walletAddress: quoteData.walletAddress,
    fromAsset: quoteData.fromAsset,
    toAsset: quoteData.toAsset,
    inputAmount: quoteData.inputAmount,
  });
  assert.equal(validCheck.valid, true);

  // Stale quote
  const expiredBinding = createQuoteBinding({ ...quoteData, ttlMs: -100 });
  const expiredCheck = verifyQuoteBinding({
    binding: expiredBinding,
    chain: quoteData.chain,
    walletAddress: quoteData.walletAddress,
    fromAsset: quoteData.fromAsset,
    toAsset: quoteData.toAsset,
    inputAmount: quoteData.inputAmount,
  });
  assert.equal(expiredCheck.valid, false);
  assert.equal(expiredCheck.error, "quote_expired");

  // Tampered payload
  const tamperedCheck = verifyQuoteBinding({
    binding,
    chain: quoteData.chain,
    walletAddress: quoteData.walletAddress,
    fromAsset: quoteData.fromAsset,
    toAsset: "FRAUD",
    inputAmount: quoteData.inputAmount,
  });
  assert.equal(tamperedCheck.valid, false);
  assert.equal(tamperedCheck.error, "quote_binding_mismatch");

  console.log("✓ Cryptographic quote binding (HMAC verification, expiration, tamper detection) passed");
}

async function testChainReconciliationNoRebroadcast() {
  // Test EVM reconciliation without rebroadcasting
  const evmHash = "0x" + "c".repeat(64);
  createTransactionRecord({
    hash: evmHash,
    type: "swap",
    decisionAction: "swap",
    asset: "ETH",
    valueUsd: 1500,
    status: "submitted",
    lifecycleStatus: "submitted",
    chainFamily: "evm",
    network: "ethereum",
    walletAddress: "0x1111111111111111111111111111111111111111",
    userApproved: true,
    submittedAt: new Date().toISOString(),
  });

  configureEvmSimulator("evm", "ethereum", {
    pollSequence: [
      { status: "confirmed", confirmations: 3, blockNumber: 500 },
    ],
  });

  const evmRecon = await reconcileTransactionAgainstChain(evmHash, {
    chainFamily: "evm",
    network: "ethereum",
    maxAttempts: 2,
    pollIntervalMs: 5,
  });

  assert.equal(evmRecon.onChain, true, "EVM transaction should be found on-chain");
  assert.equal(evmRecon.status, "confirmed", "EVM transaction should transition to confirmed");
  clearEvmSimulator();

  // Test Stellar reconciliation without rebroadcasting
  const stellarHash = "D".repeat(64);
  createTransactionRecord({
    hash: stellarHash,
    type: "swap",
    decisionAction: "swap",
    asset: "XLM",
    valueUsd: 500,
    status: "submitted",
    lifecycleStatus: "submitted",
    chainFamily: "stellar",
    network: "stellar-testnet",
    walletAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    userApproved: true,
    submittedAt: new Date().toISOString(),
  });

  configureStellarSimulator("stellar", "stellar-testnet", {
    pollSequence: [
      { status: "confirmed", ledger: 1000, latestLedger: 1002, confirmations: 2 },
    ],
  });

  const stellarRecon = await reconcileTransactionAgainstChain(stellarHash, {
    chainFamily: "stellar",
    network: "stellar-testnet",
    maxAttempts: 2,
    pollIntervalMs: 5,
  });

  assert.equal(stellarRecon.onChain, true, "Stellar transaction should be found on-chain");
  assert.equal(stellarRecon.status, "confirmed", "Stellar transaction should transition to confirmed");
  clearStellarSimulator();

  console.log("✓ Chain reconciliation without secondary broadcast (EVM & Stellar) passed");
}

async function main() {
  console.log("Running execution idempotency and replay safety checks...");
  await testIdempotencyCore();
  await testConcurrentSubmissionSafety();
  await testQuoteBindingIntegrity();
  await testChainReconciliationNoRebroadcast();
  console.log("All execution idempotency checks passed successfully!");
}

main().catch((err) => {
  console.error("Execution idempotency check failed:", err);
  process.exit(1);
});
