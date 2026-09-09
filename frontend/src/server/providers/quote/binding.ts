import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { QuoteBinding, QuoteResult } from "./types";
import type { StellarSwapQuote } from "@/server/types";

const QUOTE_BINDING_SECRET =
  process.env.QUOTE_BINDING_SECRET ??
  "golden-raccoon-quote-cryptographic-binding-internal-secret-v1";

export interface ComputeQuoteHashInput {
  chain: string;
  walletAddress?: string;
  fromAsset: string;
  toAsset: string;
  inputAmount: string;
  minReceiveAmount?: string;
  expiresAt?: string;
  ttlMs?: number;
}

/**
 * Normalizes an asset identifier for binding calculations.
 */
function normalizeAsset(asset: string): string {
  const trimmed = asset.trim().toLowerCase();
  if (["xlm", "native", "stellar:xlm"].includes(trimmed)) return "xlm";
  return trimmed;
}

/**
 * Computes a deterministic SHA-256 hash across canonical quote parameters.
 */
export function computeQuoteHash(input: ComputeQuoteHashInput): string {
  const expiresAt = (input.expiresAt ?? "").trim();
  const canonicalPayload = [
    input.chain.trim().toLowerCase(),
    (input.walletAddress ?? "").trim().toLowerCase(),
    normalizeAsset(input.fromAsset),
    normalizeAsset(input.toAsset),
    input.inputAmount.trim(),
    (input.minReceiveAmount ?? "").trim(),
    expiresAt,
  ].join("|");

  return createHash("sha256").update(canonicalPayload).digest("hex");
}

/**
 * Signs a quote hash using HMAC-SHA256.
 */
export function signQuoteHash(quoteHash: string, secret: string = QUOTE_BINDING_SECRET): string {
  return createHmac("sha256", secret).update(quoteHash).digest("hex");
}

/**
 * Creates a cryptographically bound QuoteBinding structure.
 */
export function createQuoteBinding(
  input: ComputeQuoteHashInput,
  secret: string = QUOTE_BINDING_SECRET,
): QuoteBinding {
  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + (input.ttlMs ?? 60_000)).toISOString();

  const preparedInput = { ...input, expiresAt };
  const quoteHash = computeQuoteHash(preparedInput);
  const signature = signQuoteHash(quoteHash, secret);

  return {
    quoteHash,
    signature,
    quoteSignature: signature,
    chain: preparedInput.chain.trim().toLowerCase(),
    walletAddress: preparedInput.walletAddress ? preparedInput.walletAddress.trim() : undefined,
    fromAsset: preparedInput.fromAsset.trim(),
    toAsset: preparedInput.toAsset.trim(),
    inputAmount: preparedInput.inputAmount.trim(),
    minReceiveAmount: preparedInput.minReceiveAmount?.trim(),
    expiresAt,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Attaches a QuoteBinding to a QuoteResult object.
 */
export function attachBindingToQuoteResult(
  quote: QuoteResult,
  requestContext?: { chain?: string; walletAddress?: string },
): QuoteResult {
  const fromAsset = quote.route[0] ?? "unknown";
  const toAsset = quote.route[quote.route.length - 1] ?? "unknown";
  const chain = requestContext?.chain ?? quote.providerMeta.network ?? "unknown";

  const binding = createQuoteBinding({
    chain,
    walletAddress: requestContext?.walletAddress,
    fromAsset,
    toAsset,
    inputAmount: quote.inputAmount,
    minReceiveAmount: quote.minReceiveAmount,
    expiresAt: quote.expiresAt,
  });

  quote.quoteHash = binding.quoteHash;
  quote.quoteSignature = binding.signature;
  quote.binding = binding;

  return quote;
}

/**
 * Attaches a QuoteBinding to a StellarSwapQuote object.
 */
export function attachBindingToStellarQuote(
  quote: StellarSwapQuote & {
    fromAsset?: string;
    toAsset?: string;
    inputAmount?: string;
    minReceiveAmount?: string;
    route?: string[];
    chain?: string;
    walletAddress?: string;
  },
  walletAddress?: string,
): StellarSwapQuote {
  const fromAsset =
    quote.fromAsset ??
    quote.sendAsset ??
    (quote.route && quote.route[0]) ??
    "unknown";
  const toAsset =
    quote.toAsset ??
    quote.destAsset ??
    (quote.route && quote.route[quote.route.length - 1]) ??
    "unknown";
  const inputAmount = String(
    quote.inputAmount ??
    quote.sendAmount ??
    quote.exactInputAmount ??
    "0",
  );
  const minReceiveAmount = String(
    quote.minReceiveAmount ??
    quote.destMin ??
    quote.destAmount ??
    "0",
  );
  const chain = quote.network ?? quote.chain ?? "stellar";
  const wallet = walletAddress ?? quote.walletAddress;
  const expiresAt =
    quote.expiresAt ??
    new Date(Date.now() + 60_000).toISOString();

  const binding = createQuoteBinding({
    chain,
    walletAddress: wallet,
    fromAsset,
    toAsset,
    inputAmount,
    minReceiveAmount,
    expiresAt,
  });

  quote.quoteHash = binding.quoteHash;
  quote.quoteSignature = binding.signature;
  quote.binding = binding;

  return quote;
}

export interface VerifyQuoteBindingOptions {
  chain: string;
  walletAddress?: string;
  fromAsset: string;
  toAsset: string;
  inputAmount?: string;
  maxAmountDeviationBps?: number;
  nowMs?: number;
  secret?: string;
}

export interface VerifyQuoteBindingResult {
  valid: boolean;
  reason?: string;
  expired?: boolean;
  error?: "quote_expired" | "quote_binding_mismatch" | null;
}

export type VerifyQuoteBindingInput =
  | QuoteBinding
  | (VerifyQuoteBindingOptions & { binding?: QuoteBinding });

/**
 * Verifies that a quote binding is cryptographically authentic, not expired,
 * and matches the requested execution parameters.
 * Supports both verifyQuoteBinding(binding, expected) and verifyQuoteBinding({ binding, ...expected }).
 */
export function verifyQuoteBinding(
  bindingOrOptions: VerifyQuoteBindingInput | undefined,
  maybeExpected?: VerifyQuoteBindingOptions,
): VerifyQuoteBindingResult {
  let binding: QuoteBinding | undefined;
  let expected: VerifyQuoteBindingOptions;

  if (bindingOrOptions && "chain" in bindingOrOptions && !("signature" in bindingOrOptions)) {
    binding = bindingOrOptions.binding;
    expected = bindingOrOptions;
  } else {
    binding = bindingOrOptions as QuoteBinding | undefined;
    expected = maybeExpected ?? {
      chain: "",
      fromAsset: "",
      toAsset: "",
    };
  }

  if (!binding) {
    return { valid: false, error: "quote_binding_mismatch", reason: "Quote binding is required but missing." };
  }

  // 1. Verify cryptographic HMAC signature
  const secret = expected.secret ?? QUOTE_BINDING_SECRET;
  const expectedSignature = signQuoteHash(binding.quoteHash, secret);

  const sigBuf = Buffer.from(binding.signature, "hex");
  const expectedSigBuf = Buffer.from(expectedSignature, "hex");

  if (sigBuf.length !== expectedSigBuf.length || !timingSafeEqual(sigBuf, expectedSigBuf)) {
    return { valid: false, error: "quote_binding_mismatch", reason: "Cryptographic quote signature verification failed." };
  }

  // 2. Re-compute hash from binding parameters to ensure integrity
  const recomputedHash = computeQuoteHash({
    chain: binding.chain,
    walletAddress: binding.walletAddress,
    fromAsset: binding.fromAsset,
    toAsset: binding.toAsset,
    inputAmount: binding.inputAmount,
    minReceiveAmount: binding.minReceiveAmount,
    expiresAt: binding.expiresAt,
  });

  if (recomputedHash !== binding.quoteHash) {
    return { valid: false, error: "quote_binding_mismatch", reason: "Quote binding payload tampering detected." };
  }

  // 3. Expiry verification
  const now = expected.nowMs ?? Date.now();
  const expiresAtMs = new Date(binding.expiresAt).getTime();
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= now) {
    return { valid: false, expired: true, error: "quote_expired", reason: `Quote expired at ${binding.expiresAt}.` };
  }

  // 4. Chain match
  if (expected.chain && binding.chain.toLowerCase() !== expected.chain.trim().toLowerCase()) {
    return {
      valid: false,
      error: "quote_binding_mismatch",
      reason: `Chain mismatch in quote binding. Expected ${expected.chain}, found ${binding.chain}.`,
    };
  }

  // 5. Wallet match (if bound)
  if (
    expected.walletAddress &&
    binding.walletAddress &&
    binding.walletAddress.trim().toLowerCase() !== expected.walletAddress.trim().toLowerCase()
  ) {
    return {
      valid: false,
      error: "quote_binding_mismatch",
      reason: `Wallet address mismatch in quote binding. Expected ${expected.walletAddress}, found ${binding.walletAddress}.`,
    };
  }

  // 6. Asset match
  const fromExpected = normalizeAsset(expected.fromAsset);
  const fromBound = normalizeAsset(binding.fromAsset);
  if (fromExpected !== fromBound && !fromBound.includes(fromExpected) && !fromExpected.includes(fromBound)) {
    return {
      valid: false,
      error: "quote_binding_mismatch",
      reason: `Source asset mismatch. Expected ${expected.fromAsset}, found ${binding.fromAsset}.`,
    };
  }

  const toExpected = normalizeAsset(expected.toAsset);
  const toBound = normalizeAsset(binding.toAsset);
  if (toExpected !== toBound && !toBound.includes(toExpected) && !toExpected.includes(toBound)) {
    return {
      valid: false,
      error: "quote_binding_mismatch",
      reason: `Destination asset mismatch. Expected ${expected.toAsset}, found ${binding.toAsset}.`,
    };
  }

  // 7. Input amount match (if specified)
  if (expected.inputAmount) {
    const expNum = Number.parseFloat(expected.inputAmount);
    const boundNum = Number.parseFloat(binding.inputAmount);
    if (Number.isFinite(expNum) && Number.isFinite(boundNum) && boundNum > 0) {
      const maxBps = expected.maxAmountDeviationBps ?? 500; // 5% default tolerance
      const deviationBps = (Math.abs(expNum - boundNum) / boundNum) * 10_000;
      if (deviationBps > maxBps) {
        return {
          valid: false,
          error: "quote_binding_mismatch",
          reason: `Input amount deviated by ${deviationBps.toFixed(1)} bps, exceeding threshold of ${maxBps} bps.`,
        };
      }
    }
  }

  return { valid: true, error: null };
}
