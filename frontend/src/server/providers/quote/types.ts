/**
 * Chain-aware quote provider types.
 *
 * These types define the normalized contract between quote providers
 * (Stellar Horizon path finding, DexScreener, etc.) and the rest of the
 * application.  Every provider implements the same `QuoteRequest` →
 * `QuoteResult` interface so the execution agent never depends on
 * chain-specific quote fields from the client.
 */

// ─── Provider identifiers ────────────────────────────────────────────

export type QuoteProvider =
  | "stellar_horizon"
  | "dexscreener"
  | "planned_dex_aggregator";

export type QuoteRouteType =
  | "classic_path_payment"
  | "soroban_swap"
  | "mixed"
  | "evm_dex";

// ─── Request ─────────────────────────────────────────────────────────

export type QuoteAsset = {
  symbol: string;
  contractAddress?: string;
  issuer?: string;
  assetKey?: string;
  decimals?: number;
};

export type QuoteRequest = {
  /** Wallet that will sign the eventual transaction. */
  walletAddress: string;
  /** Normalized chain id (e.g. "stellar-testnet", "ethereum", "base"). */
  chain: string;
  /** Chain family ("evm" | "stellar"). */
  chainFamily: "evm" | "stellar";

  /** Source asset identifier (symbol, address, or "native" for XLM). */
  fromAsset: string;
  fromAssetMeta?: QuoteAsset;
  /** Destination asset identifier. */
  toAsset: string;
  toAssetMeta?: QuoteAsset;

  /** Issuer for Stellar classic assets. */
  fromIssuer?: string;
  toIssuer?: string;

  /**
   * Amount to swap, expressed as a decimal-integer-safe string.
   * For XLM the units are the native (non-stroop) amount (e.g. "100").
   * For EVM assets the units match the token decimals.
   */
  amount: string;
  /** Slippage tolerance in basis points (1 % = 100). */
  slippageBps: number;

  /** Provider-specific options that are transparent to callers. */
  providerOptions?: Record<string, unknown>;
};

// ─── Fee estimate ────────────────────────────────────────────────────

export type QuoteFeeEstimate = {
  /** Native fee token symbol (XLM, ETH, etc.). */
  nativeToken: string;
  /**
   * Estimated fee in the native token, expressed as a decimal string.
   * For Stellar this is the stroop fee (base fee * operations).
   * For EVM this is the gas estimate in wei/gwei.
   */
  amount: string;
  /** Estimated fee in USD for display purposes. */
  usdValue: number;
};

// ─── Stellar-specific operation data ─────────────────────────────────

export type StellarPathPaymentOp = {
  type: "path_payment_strict_send" | "path_payment_strict_receive";
  sendAsset: string;
  sendAmount: string;
  destination: string;
  destAsset: string;
  destMin: string;
  path: string[];
};

export type StellarSorobanSwapOp = {
  type: "soroban_swap";
  contractId: string;
  method: string;
  args: string[];
  sourceAccount: string;
  footprint: string[];
  fee?: number;
};

export type StellarQuoteOperation =
  | StellarPathPaymentOp
  | StellarSorobanSwapOp;

// ─── Result ──────────────────────────────────────────────────────────

export type QuoteResult = {
  /** Provider that produced this quote. */
  provider: QuoteProvider;
  /** Route type. */
  routeType: QuoteRouteType;
  /** Ordered list of asset identifiers along the route. */
  route: string[];

  // ── Amounts (decimal strings, never floats) ────────────────────────
  inputAmount: string;
  expectedOutputAmount: string;
  minReceiveAmount: string;

  /** Estimated USD value of the output at quote time. */
  estimatedValueUsd: number;
  /** Price impact in basis points. */
  priceImpactBps: number;
  /** Slippage tolerance in basis points. */
  slippageBps: number;

  /** Fee estimate for the swap. */
  feeEstimate: QuoteFeeEstimate;

  // ── Chain-specific payloads ────────────────────────────────────────
  stellarOps?: StellarQuoteOperation[];
  /** Soroban swap simulation details, populated after simulation. */
  sorobanSimulation?: {
    contractId: string;
    method: string;
    args: string[];
    sourceAccount: string;
    footprint: string[];
    fee?: number;
  };

  /**
   * EVM swap calldata (if the provider returns it).
   * Not currently populated by DexScreener; may be added by future
   * aggregator providers (1inch, LI.FI, etc.).
   */
  evmCalldata?: string;
  /** Target contract address for EVM swaps. */
  evmTo?: string;
  /** Native value to send (wei). */
  evmValue?: string;

  // ── Expiry ─────────────────────────────────────────────────────────
  /** ISO-8601 timestamp when this quote should be considered stale. */
  expiresAt: string;
  /** ISO-8601 timestamp when this quote was fetched. */
  fetchedAt: string;

  /** Quote freshness status. */
  status: "fresh" | "simulated" | "stale" | "unavailable";

  /** Human-readable detail for display in the UI. */
  detail: string;

  /** Provider execution metadata. */
  providerMeta: {
    provider: string;
    network: string;
    latencyMs: number;
    retries?: number;
    fallbackUsed?: boolean;
    detail?: string;
  };
};

// ─── Verification result ─────────────────────────────────────────────

export type QuoteVerificationIssue = {
  field: string;
  expected: string;
  actual: string;
  severity: "error" | "warning";
};

export type QuoteVerificationResult = {
  ok: boolean;
  issues: QuoteVerificationIssue[];
  stale: boolean;
  expired: boolean;
  detail: string;
};

// ─── Provider config ─────────────────────────────────────────────────

export type QuoteProviderConfig = {
  /** Maximum time to wait for a provider response (ms). */
  timeoutMs: number;
  /** Number of retries on transient failure. */
  retries: number;
  /** Base backoff delay (ms). */
  backoffMs: number;
};

export const defaultQuoteProviderConfig: QuoteProviderConfig = {
  timeoutMs: 10_000,
  retries: 1,
  backoffMs: 500,
};

// ─── Error codes ─────────────────────────────────────────────────────

export type QuoteErrorCode =
  | "no_route"
  | "timeout"
  | "rate_limited"
  | "network_error"
  | "malformed_response"
  | "mismatch"
  | "unsupported_chain"
  | "invalid_request"
  | "provider_error";

export type QuoteError = {
  code: QuoteErrorCode;
  message: string;
  retryable: boolean;
  detail?: string;
};

export function getQuoteErrorCode(error: unknown): QuoteErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("abort")) return "timeout";
  if (lower.includes("429") || lower.includes("rate limit")) return "rate_limited";
  if (lower.includes("no route") || lower.includes("no path") || lower.includes("route")) return "no_route";
  if (lower.includes("fetch") || lower.includes("network") || lower.includes("econnreset")) return "network_error";
  if (lower.includes("mismatch") || lower.includes("expected") || lower.includes("different")) return "mismatch";
  if (lower.includes("unsupported") || lower.includes("not supported")) return "unsupported_chain";
  if (lower.includes("invalid") || lower.includes("malformed") || lower.includes("parse")) return "malformed_response";

  return "provider_error";
}
