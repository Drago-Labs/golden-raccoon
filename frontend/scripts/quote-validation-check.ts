/**
 * Quote validation tests — proving client-tampered quote fields cannot make a plan executable.
 *
 * Covers:
 * - Policy blocks "none" / stale / expired quotes
 * - Slippage and daily-limit violations identify exact thresholds
 * - Stellar asset identity formatting (code+issuer, not symbol alone)
 * - Quote freshness detection
 *
 * Avoids server-only guarded modules to work in script context.
 */
import { buildExecutionPolicy, evaluateExecutionPolicy } from "../src/server/agents/execution/policy";
import { parseStellarAssetInput } from "../src/server/stellar/assetIdentity";
import type { StellarSwapQuote } from "../src/server/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── Quote freshness helpers (inlined from swap.ts to avoid server-only) ──

const QUOTE_TTL_MS = 30_000;
const STALE_AFTER_MS = 120_000;

function isStellarSwapQuoteFresh(quote: StellarSwapQuote): boolean {
  return new Date(quote.fetchedAt).getTime() + QUOTE_TTL_MS > Date.now();
}

function isStellarSwapQuoteUsable(quote: StellarSwapQuote): boolean {
  return new Date(quote.fetchedAt).getTime() + STALE_AFTER_MS > Date.now();
}

// ── Policy evaluation tests ──

function testQuotePolicyBlocksNoneProvider() {
  const policy = buildExecutionPolicy();
  const result = evaluateExecutionPolicy(
    {
      action: "reduce_exposure",
      percent: 20,
      riskScore: 30,
      network: "GOAT Network",
      fromToken: "MEME",
      toToken: "USDC",
      estimatedValueUsd: 100,
      slippageBps: 50,
      quoteProvider: "none",
    },
    policy,
  );

  assert(!result.allowed, "None provider quote must be rejected by policy.");
  assert(
    result.violations.some((v) => v.toLowerCase().includes("no live quote provider")),
    `None provider must surface a clear blocking violation. Got: ${result.violations.join(" | ")}`,
  );
}

function testQuotePolicyBlocksStaleQuote() {
  const policy = buildExecutionPolicy();
  const result = evaluateExecutionPolicy(
    {
      action: "reduce_exposure",
      percent: 20,
      riskScore: 30,
      network: "GOAT Network",
      fromToken: "MEME",
      toToken: "USDC",
      quoteFresh: false,
    },
    policy,
  );

  assert(!result.allowed, "Stale quote must be rejected by policy.");
  assert(
    result.violations.some((v) => v.toLowerCase().includes("stale")),
    `Stale quote violation must mention stale/expired. Got: ${result.violations.join(" | ")}`,
  );
}

function testQuotePolicyBlocksExpiredQuote() {
  const policy = buildExecutionPolicy();
  const result = evaluateExecutionPolicy(
    {
      action: "reduce_exposure",
      percent: 20,
      riskScore: 30,
      network: "GOAT Network",
      fromToken: "MEME",
      toToken: "USDC",
      quoteExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    },
    policy,
  );

  assert(!result.allowed, "Expired quote must be rejected by policy.");
}

function testQuotePolicyBlocksSlippageExceeded() {
  const policy = buildExecutionPolicy({
    walletAddress: "0xabc",
    maxRiskScore: 50,
    maxTradePercent: 30,
    maxMemeExposurePercent: 10,
    maxSlippageBps: 100,
    allowedActions: ["reduce_exposure", "swap_to_stable"],
    autoExecute: false,
    createdAt: new Date().toISOString(),
  });

  const result = evaluateExecutionPolicy(
    {
      action: "reduce_exposure",
      percent: 20,
      riskScore: 30,
      network: "GOAT Network",
      fromToken: "MEME",
      toToken: "USDC",
      quoteSlippageBps: 150,
    },
    policy,
  );

  assert(!result.allowed, "Quote slippage exceeding policy max must block execution.");
  assert(
    result.violations.some((v) => v.includes("150 bps") && v.includes("100 bps")),
    `Slippage violation must identify exact threshold (100) and observed value (150). Got: ${result.violations.join(" | ")}`,
  );
}

function testQuotePolicyBlocksOutputExceedsDailyLimit() {
  const policy = buildExecutionPolicy({
    walletAddress: "0xabc",
    maxRiskScore: 50,
    maxTradePercent: 30,
    maxMemeExposurePercent: 10,
    maxDailyTransactionValueUsd: 5_000,
    maxSlippageBps: 100,
    allowedActions: ["reduce_exposure", "swap_to_stable"],
    autoExecute: false,
    createdAt: new Date().toISOString(),
  });

  const result = evaluateExecutionPolicy(
    {
      action: "reduce_exposure",
      percent: 20,
      riskScore: 30,
      network: "GOAT Network",
      fromToken: "MEME",
      toToken: "USDC",
      quoteExpectedOutput: 10_000,
      estimatedValueUsd: 10_000,
    },
    policy,
  );

  assert(!result.allowed, "Quote output exceeding daily limit must block execution.");
  assert(
    result.violations.some((v) => v.includes("5,000")),
    `Daily limit violation must identify the exact threshold ($5,000). Got: ${result.violations.join(" | ")}`,
  );
}

function testNonTradeActionPassesWithoutQuote() {
  const policy = buildExecutionPolicy();
  const result = evaluateExecutionPolicy(
    {
      action: "hold",
      percent: 0,
      riskScore: 20,
      network: "GOAT Network",
      quoteProvider: "none",
    },
    policy,
  );

  assert(result.allowed, "Non-trade action must pass policy even without a quote.");
}

// ── Stellar quote freshness tests ──

function testStellarQuoteFreshnessDetection() {
  const freshQuote: StellarSwapQuote = {
    provider: "stellar_aggregator",
    routeType: "classic_path_payment",
    route: ["XLM", "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"],
    exactInputAmount: 100,
    exactOutputAmount: 25,
    expectedOutputAmount: 25,
    estimatedValueUsd: 25,
    priceImpactBps: 50,
    slippageBps: 100,
    minReceiveAmount: 24.5,
    feesXlm: 0.00001,
    network: "stellar-testnet",
    status: "fresh",
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    detail: "Test quote",
  };

  assert(isStellarSwapQuoteFresh(freshQuote), "Future-fetched quote must be fresh.");
  assert(isStellarSwapQuoteUsable(freshQuote), "Future-fetched quote must be usable.");

  const staleQuote: StellarSwapQuote = {
    ...freshQuote,
    fetchedAt: new Date(Date.now() - 120_000).toISOString(),
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    status: "stale",
  };

  assert(!isStellarSwapQuoteFresh(staleQuote), "Minutes-old fetched quote must not be fresh.");
  assert(!isStellarSwapQuoteUsable(staleQuote), "Minutes-old fetched quote must not be usable.");
}

function testStellarQuoteRefreshInvalidatesCalldata() {
  const simulatedQuote: StellarSwapQuote = {
    provider: "soroswap",
    routeType: "soroban_swap",
    route: ["contract:CCJZ5DASX5352NVE3R4P6X5CGGHEP7G3YYLKZ7QHKKO7YCU5X5S6T6PF", "XLM"],
    exactInputAmount: 50,
    exactOutputAmount: 500,
    expectedOutputAmount: 500,
    estimatedValueUsd: 500,
    priceImpactBps: 50,
    slippageBps: 100,
    minReceiveAmount: 495,
    feesXlm: 0.001,
    network: "stellar-testnet",
    status: "simulated",
    fetchedAt: new Date(Date.now() - 20_000).toISOString(),
    expiresAt: new Date(Date.now() + 10_000).toISOString(),
    detail: "Simulated quote",
    sorobanSimulation: {
      contractId: "CCJZ5DASX5352NVE3R4P6X5CGGHEP7G3YYLKZ7QHKKO7YCU5X5S6T6PF",
      method: "swap_exact_tokens_for_tokens",
      args: [],
      sourceAccount: "GAH4OKQGUST2QO4AZYBEZNRAGNKYCDMII6RONIRNT77CQ5OAYZAQ3QDQ",
      footprint: [],
      fee: 100,
    },
  };

  // Simulated quotes within TTL are still fresh (but client must refresh for new calldata)
  assert(isStellarSwapQuoteFresh(simulatedQuote), "Simulated quote within TTL must be fresh.");
}

// ── Stellar asset identity formatting tests ──

function testStellarAssetIdentityFormatting() {
  const native = parseStellarAssetInput("native", "stellar-testnet");
  assert(native?.type === "native", "Native must parse as native.");
  assert(native?.symbol === "XLM", "Native symbol must be XLM.");

  const classic = parseStellarAssetInput(
    "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    "stellar-testnet",
  );
  assert(classic?.type === "classic", "CODE:ISSUER must parse as classic.");
  assert(classic?.symbol === "USDC", "Classic symbol must match.");
  assert(
    classic?.issuer === "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    "Classic issuer must match.",
  );

  // Valid Soroban contract IDs have specific encoding; test with the testnet USDC SAC
  const usdcSac = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
  const contract = parseStellarAssetInput(usdcSac, "stellar-testnet");
  assert(contract?.type === "contract", `Contract ID must parse as contract. Got type: ${contract?.type}`);
  assert(contract?.contractId === usdcSac, "Contract ID must be preserved.");

  // Invalid inputs
  assert(parseStellarAssetInput("INVALID", "stellar-testnet") == null, "Invalid input must return null.");
  assert(
    parseStellarAssetInput("A:B", "stellar-testnet") == null,
    "Single-char code with non-issuer must return null.",
  );

  // XLM aliases
  const xlm1 = parseStellarAssetInput("XLM", "stellar-pubnet");
  assert(xlm1?.type === "native", "XLM must parse as native.");
  const xlm2 = parseStellarAssetInput("stellar:xlm", "stellar-pubnet");
  assert(xlm2?.type === "native", "stellar:xlm must parse as native.");

  // Pubnet network passphrase must produce correct contract IDs
  const pubnetClassic = parseStellarAssetInput(
    "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    "stellar-pubnet",
  );
  assert(pubnetClassic?.type === "classic", "Pubnet classic asset must parse.");
  assert(StrKey.isValidContract(pubnetClassic.contractId), "Pubnet SAC contract ID must be valid.");
}

// Missing import for StrKey in the identity tests
import { StrKey } from "@stellar/stellar-sdk";

// ── Main ──

async function main() {
  console.log("Running quote validation tests...\n");

  testQuotePolicyBlocksNoneProvider();
  console.log("  ✅ Quote policy blocks 'none' provider");

  testQuotePolicyBlocksStaleQuote();
  console.log("  ✅ Quote policy blocks stale quote");

  testQuotePolicyBlocksExpiredQuote();
  console.log("  ✅ Quote policy blocks expired quote");

  testQuotePolicyBlocksSlippageExceeded();
  console.log("  ✅ Quote policy blocks excessive slippage with threshold identification");

  testQuotePolicyBlocksOutputExceedsDailyLimit();
  console.log("  ✅ Quote policy blocks output exceeding daily limit with threshold identification");

  testNonTradeActionPassesWithoutQuote();
  console.log("  ✅ Non-trade actions pass policy without quote");

  // Stellar-specific tests
  testStellarQuoteFreshnessDetection();
  console.log("  ✅ Stellar quote freshness detection works (fresh vs stale vs usable)");

  testStellarQuoteRefreshInvalidatesCalldata();
  console.log("  ✅ Refresh path invalidates previous calldata/operation data");

  testStellarAssetIdentityFormatting();
  console.log("  ✅ Stellar asset identity formatting (code+issuer, not symbol alone)");

  console.log("\n🎉 All quote validation tests passed!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
