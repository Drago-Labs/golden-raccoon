/**
 * Quote verification module.
 *
 * Verifies that a `QuoteResult` matches the originating `QuoteRequest` and
 * is not stale, expired, or malformed.  This is the gate that ensures the
 * execution agent never accepts a client-supplied or mismatched quote.
 */
import "server-only";

import { getChainFamily, isTransactionHashForChain } from "@/lib/chainIdentity";
import {
  type QuoteRequest,
  type QuoteResult,
  type QuoteVerificationIssue,
  type QuoteVerificationResult,
} from "@/server/providers/quote/types";

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULT_MAX_AGE_MS = 60_000; // 1 min max age for any quote

// ─── Verification ────────────────────────────────────────────────────

export function verifyQuote(
  request: QuoteRequest,
  quote: QuoteResult,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
): QuoteVerificationResult {
  const issues: QuoteVerificationIssue[] = [];
  const chainFamily = getChainFamily(request.chain);

  // 1. Wallet match
  if (request.walletAddress && !walletMatches(quote, request.walletAddress, chainFamily)) {
    issues.push({
      field: "walletAddress",
      expected: request.walletAddress,
      actual: "not found in quote metadata",
      severity: "error",
    });
  }

  // 2. Network match
  if (request.chain && quote.providerMeta.network !== request.chain) {
    // For DexScreener, the network is the DexScreener chain id, not ours
    const scanNetwork = getNetworkFromQuote(request.chain, quote.providerMeta.network);
    if (!scanNetwork) {
      issues.push({
        field: "network",
        expected: request.chain,
        actual: quote.providerMeta.network,
        severity: "error",
      });
    }
  }

  // 3. Asset match (source)
  const fromAssetId = normalizeAssetForComparison(request.fromAsset, request.fromIssuer);
  const quoteFrom = quote.route[0] ?? "";
  if (fromAssetId && !assetsMatch(fromAssetId, quoteFrom)) {
    issues.push({
      field: "fromAsset",
      expected: fromAssetId,
      actual: quoteFrom,
      severity: "error",
    });
  }

  // 4. Asset match (destination)
  const toAssetId = normalizeAssetForComparison(request.toAsset, request.toIssuer);
  const quoteTo = quote.route[quote.route.length - 1] ?? "";
  if (toAssetId && !assetsMatch(toAssetId, quoteTo)) {
    issues.push({
      field: "toAsset",
      expected: toAssetId,
      actual: quoteTo,
      severity: "error",
    });
  }

  // 5. Amount match (approximate — allow 10 % deviation for price movement)
  const requestAmount = Number.parseFloat(request.amount);
  const inputAmount = Number.parseFloat(quote.inputAmount);
  if (
    Number.isFinite(requestAmount) &&
    Number.isFinite(inputAmount) &&
    inputAmount > 0
  ) {
    const deviation = Math.abs(requestAmount - inputAmount) / inputAmount;
    if (deviation > 0.1) {
      issues.push({
        field: "amount",
        expected: request.amount,
        actual: quote.inputAmount,
        severity: "warning",
      });
    }
  }

  // 6. Expiry
  const now = Date.now();
  const fetchedAt = new Date(quote.fetchedAt).getTime();
  const expiresAt = new Date(quote.expiresAt).getTime();
  const ageMs = now - fetchedAt;

  const stale = !Number.isNaN(ageMs) && ageMs > DEFAULT_MAX_AGE_MS;
  const expired = !Number.isNaN(expiresAt) && expiresAt < now;

  if (expired) {
    issues.push({
      field: "expiresAt",
      expected: `> ${new Date().toISOString()}`,
      actual: quote.expiresAt,
      severity: "error",
    });
  }

  if (stale && !expired) {
    issues.push({
      field: "fetchedAt",
      expected: `< ${new Date(now - DEFAULT_MAX_AGE_MS).toISOString()}`,
      actual: quote.fetchedAt,
      severity: "warning",
    });
  }

  // 7. Malformed response checks
  const outputAmount = Number.parseFloat(quote.expectedOutputAmount);
  const minReceive = Number.parseFloat(quote.minReceiveAmount);

  if (!Number.isFinite(outputAmount) || outputAmount < 0) {
    issues.push({
      field: "expectedOutputAmount",
      expected: "a non-negative number",
      actual: quote.expectedOutputAmount,
      severity: "error",
    });
  }

  if (!Number.isFinite(minReceive) || minReceive < 0) {
    issues.push({
      field: "minReceiveAmount",
      expected: "a non-negative number",
      actual: quote.minReceiveAmount,
      severity: "error",
    });
  }

  if (outputAmount > 0 && minReceive > 0 && minReceive > outputAmount) {
    issues.push({
      field: "minReceiveAmount",
      expected: `<= ${outputAmount}`,
      actual: `${minReceive} > ${outputAmount}`,
      severity: "error",
    });
  }

  if (
    Number.isFinite(outputAmount) &&
    Number.isFinite(requestAmount) &&
    requestAmount > 0 &&
    outputAmount <= 0 &&
    quote.status !== "unavailable"
  ) {
    issues.push({
      field: "expectedOutputAmount",
      expected: "> 0 for a valid swap",
      actual: quote.expectedOutputAmount,
      severity: "error",
    });
  }

  // 8. Quote status
  if (quote.status === "unavailable") {
    issues.push({
      field: "status",
      expected: "fresh, stale, or simulated",
      actual: "unavailable",
      severity: "error",
    });
  }

  const ok = issues.filter((i) => i.severity === "error").length === 0;

  return {
    ok,
    issues,
    stale,
    expired,
    detail: ok
      ? "Quote verification passed."
      : `Quote verification failed with ${issues.length} issue(s): ${issues.map((i) => `${i.field} (${i.severity})`).join(", ")}.`,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function normalizeAssetForComparison(asset: string, issuer?: string): string {
  const trimmed = asset.trim().toLowerCase();
  if (["xlm", "native", "stellar:xlm"].includes(trimmed)) return "xlm";
  if (issuer) return `${trimmed}:${issuer.toLowerCase()}`;
  if (trimmed.startsWith("0x")) return trimmed;
  return trimmed;
}

function assetsMatch(expected: string, actual: string): boolean {
  const normalized = actual.toLowerCase();

  // "XLM" in route matches "native" or "xlm"
  if (expected === "xlm" && (normalized === "xlm" || normalized === "native")) return true;
  if (normalized === "xlm" && expected === "xlm") return true;

  // CODE:ISSUER matching
  return normalized.includes(expected) || expected.includes(normalized);
}

function walletMatches(quote: QuoteResult, wallet: string, chainFamily: string): boolean {
  // DexScreener EVM quotes don't include wallet-specific data —
  // wallet verification happens at signature time via the user's wallet.
  if (chainFamily === "evm") return true;

  // Stellar classic path payment ops embed the wallet as `destination`.
  // Check at least one operation references the expected wallet.
  if (chainFamily === "stellar" && quote.stellarOps && quote.stellarOps.length > 0) {
    return quote.stellarOps.some((op) => {
      if ("destination" in op && typeof op.destination === "string") {
        return op.destination.toUpperCase() === wallet.trim().toUpperCase();
      }
      if ("sourceAccount" in op && typeof op.sourceAccount === "string") {
        return op.sourceAccount.toUpperCase() === wallet.trim().toUpperCase();
      }
      return false;
    });
  }

  return true;
}

function getNetworkFromQuote(requestChain: string, quoteNetwork: string): boolean {
  // DexScreener uses chain ids like "ethereum", "base", etc.
  // Our chain config may use different names like "ethereum" → same.
  return requestChain.toLowerCase() === quoteNetwork.toLowerCase();
}
