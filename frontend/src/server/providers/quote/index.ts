/**
 * Unified quote provider factory.
 *
 * Routes a `QuoteRequest` to the correct chain-specific adapter and
 * returns a normalized `QuoteResult`.  Callers never import chain-specific
 * modules directly.
 *
 * Usage:
 * ```ts
 * import { getQuote } from "@/server/providers/quote";
 * const quote = await getQuote({ chain: "ethereum", ... });
 * ```
 */
import "server-only";

import { getChainFamily } from "@/lib/chainIdentity";
import { getScanNetwork } from "@/lib/scanNetworks";
import { runProviderAdapter } from "@/server/providers/adapter";
import { getStellarQuote } from "@/server/providers/quote/stellar";
import { getEvmQuote } from "@/server/providers/quote/evm";
import { verifyQuote } from "@/server/providers/quote/verify";
import {
  type QuoteProviderConfig,
  type QuoteRequest,
  type QuoteResult,
  type QuoteVerificationResult,
  defaultQuoteProviderConfig,
} from "@/server/providers/quote/types";

// ─── Main factory ────────────────────────────────────────────────────

/**
 * Fetch a quote for the given request, automatically routing to the
 * correct chain adapter (Stellar Horizon or DexScreener for EVM).
 */
export async function getQuote(
  request: QuoteRequest,
  config: QuoteProviderConfig = defaultQuoteProviderConfig,
): Promise<QuoteResult> {
  const chainFamily = getChainFamily(request.chain);

  if (chainFamily === "stellar") {
    return getStellarQuote({ ...request, chainFamily: "stellar" }, config);
  }

  return getEvmQuote({ ...request, chainFamily: "evm" }, config);
}

// ─── Convenience: quote + verify in one call ────────────────────────

/**
 * Fetch a quote and verify it against the original request.
 * Returns both the quote and the verification result.
 */
export async function getVerifiedQuote(
  request: QuoteRequest,
  config?: QuoteProviderConfig,
): Promise<{ quote: QuoteResult; verification: QuoteVerificationResult }> {
  const quote = await getQuote(request, config);
  const verification = verifyQuote(request, quote);
  return { quote, verification };
}

// ─── Re-exports for convenience ──────────────────────────────────────

export { getStellarQuote } from "@/server/providers/quote/stellar";
export { getEvmQuote } from "@/server/providers/quote/evm";
export { verifyQuote } from "@/server/providers/quote/verify";

export type {
  QuoteProvider,
  QuoteRequest,
  QuoteResult,
  QuoteAsset,
  QuoteFeeEstimate,
  QuoteRouteType,
  QuoteVerificationResult,
  QuoteVerificationIssue,
  QuoteProviderConfig,
  QuoteError,
  QuoteErrorCode,
} from "@/server/providers/quote/types";

// ─── Provider health check ──────────────────────────────────────────

export type QuoteProviderHealth = {
  network: string;
  available: boolean;
  provider: string;
  detail: string;
  latencyMs?: number;
};

/**
 * Check which quote providers are available for a given chain.
 */
export async function getQuoteProviderHealth(
  chain: string,
): Promise<QuoteProviderHealth[]> {
  const chainFamily = getChainFamily(chain);
  const scanNetwork = getScanNetwork(chain);

  if (chainFamily === "stellar") {
    return [
      {
        network: chain,
        available: true,
        provider: "stellar_horizon",
        detail: "Stellar Horizon path-finding endpoint",
      },
    ];
  }

  // EVM — check DexScreener availability
  const dsChainId = scanNetwork?.dexScreenerChainId;
  if (!dsChainId) {
    return [
      {
        network: chain,
        available: false,
        provider: "dexscreener",
        detail: `No DexScreener chain mapping for ${chain}`,
      },
    ];
  }

  // Quick health check
  const startedAt = performance.now();
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=USDC`,
      { signal: AbortSignal.timeout(5_000) },
    );

    return [
      {
        network: chain,
        available: response.ok,
        provider: "dexscreener",
        detail: response.ok ? "DexScreener API is reachable" : `DexScreener returned ${response.status}`,
        latencyMs: Math.round(performance.now() - startedAt),
      },
    ];
  } catch {
    return [
      {
        network: chain,
        available: false,
        provider: "dexscreener",
        detail: "DexScreener API is unreachable",
        latencyMs: Math.round(performance.now() - startedAt),
      },
    ];
  }
}
