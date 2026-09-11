import assert from "node:assert";
import { evmSettlementContract, stellarSettlementContract } from "../src/server/x402/settlement/contract";
import { settlementLedger } from "../src/server/x402/settlement/ledger";
import { receiptManager, ResourceMismatchError, ReceiptExpiredError } from "../src/server/x402/settlement/receipts";
import { pricingEngine } from "../src/server/x402/metering/pricing";
import { quotaEnforcer } from "../src/server/x402/metering/quota";
import { usageTracker } from "../src/server/x402/metering/usage";

/**
 * Executes an end-to-end verification of settlement, receipts, and metering workflows.
 */
async function main(): Promise<void> {
  console.log("Starting x402 settlement, receipts, and metering verification...");

  const quote = await pricingEngine.issueQuote({
    resource: "/api/x402/deep-scan",
    priceUsd: "$0.99",
    chainFamily: "evm",
    network: "eip155:8453",
    asset: "USDC",
    payTo: "0x1111111111111111111111111111111111111111",
    ttlSeconds: 300,
  });
  assert(quote.id.startsWith("quot_"), "Quote ID must start with quot_");
  assert(pricingEngine.isQuoteActive(quote), "Issued quote must be active");

  const validated = await pricingEngine.validatePaymentAgainstQuote(quote.id, {
    amount: "0.99",
    asset: "USDC",
    network: "eip155:8453",
    chainFamily: "evm",
    payTo: "0x1111111111111111111111111111111111111111",
  });
  assert(validated.valid, "Valid quote payment must be accepted");

  const testPayer = "0x5555555555555555555555555555555555555555";
  quotaEnforcer.setPolicy(testPayer, {
    maxRequests: 2,
    maxSpendUsd: 2.0,
    windowSeconds: 60,
  });

  const quota1 = await quotaEnforcer.checkQuota(testPayer, "evm", 0.99);
  assert(quota1.allowed, "First quota check must succeed");
  await quotaEnforcer.consume(testPayer, "evm", 0.99);

  const quota2 = await quotaEnforcer.checkQuota(testPayer, "evm", 0.99);
  assert(quota2.allowed, "Second quota check must succeed");
  await quotaEnforcer.consume(testPayer, "evm", 0.99);

  const quota3 = await quotaEnforcer.checkQuota(testPayer, "evm", 0.99);
  assert(!quota3.allowed, "Third quota check must be blocked by quota");

  const settlementPayer = "0x6666666666666666666666666666666666666666";
  const evmIdemp = `chk_evm_${Date.now()}`;
  const evmBegin = await evmSettlementContract.begin(
    {
      idempotencyKey: evmIdemp,
      requestId: `req_${evmIdemp}`,
      protectedResource: "/api/x402/deep-scan",
      requestBodyHash: "a".repeat(64),
      chainFamily: "evm",
      network: "eip155:8453",
      asset: "USDC",
      amount: "0.99",
      payTo: "0x1111111111111111111111111111111111111111",
      payer: settlementPayer,
      transactionHash: "0x" + "7".repeat(64),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    quote.id,
  );
  assert(evmBegin.record.status === "required", "EVM settlement status must be required");

  const evmProof = `evm_proof_${Date.now()}`;
  await evmSettlementContract.consumeProof(evmProof, evmBegin.record.id);

  const evmWork = await evmSettlementContract.deliverWork(
    evmIdemp,
    "/api/x402/deep-scan",
    { score: 99, risk: "low" },
    testPayer,
  );
  assert(evmWork.record.status === "served", "Delivered settlement must be served");
  assert(evmWork.receipt.id.startsWith("rcpt_"), "Receipt ID must start with rcpt_");

  const redeemed = await evmSettlementContract.redeemReceipt(
    evmWork.receipt.id,
    "/api/x402/deep-scan",
  );
  assert.deepStrictEqual(redeemed.result, { score: 99, risk: "low" }, "Redeemed result must match original");

  let boundaryBlocked = false;
  try {
    await evmSettlementContract.redeemReceipt(evmWork.receipt.id, "/api/x402/other-resource");
  } catch (err) {
    if (err instanceof ResourceMismatchError) boundaryBlocked = true;
  }
  assert(boundaryBlocked, "Receipt redemption across resource boundaries must be rejected");

  const failIdemp = `chk_fail_${Date.now()}`;
  await evmSettlementContract.begin({
    idempotencyKey: failIdemp,
    requestId: `req_${failIdemp}`,
    protectedResource: "/api/x402/deep-scan",
    requestBodyHash: "b".repeat(64),
    chainFamily: "evm",
    network: "eip155:8453",
    asset: "USDC",
    amount: "0.99",
    payTo: "0x1111111111111111111111111111111111111111",
    payer: settlementPayer,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await evmSettlementContract.recordWorkFailure(failIdemp, "Downstream scanner network timeout");
  const owedList = await evmSettlementContract.getOwedRefunds();
  assert(owedList.some((r) => r.idempotencyKey === failIdemp), "Failed work must appear in owed refunds");

  const refundRecord = await evmSettlementContract.processRefund(failIdemp);
  assert(refundRecord.status === "refunded", "Processed refund must transition to refunded");

  const stellarIdemp = `chk_stellar_${Date.now()}`;
  const stellarBegin = await stellarSettlementContract.begin({
    idempotencyKey: stellarIdemp,
    requestId: `req_${stellarIdemp}`,
    protectedResource: "/api/x402/deep-scan",
    requestBodyHash: "c".repeat(64),
    chainFamily: "stellar",
    network: "stellar:testnet",
    asset: "USDC",
    amount: "0.99",
    payTo: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAA",
    payer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  assert(stellarBegin.record.status === "required", "Stellar settlement must begin required");

  console.log("All x402 settlement, receipts, and metering checks passed successfully.");
}

main().catch((err) => {
  console.error("x402 settlement check failed:", err);
  process.exit(1);
});
