import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { X402RuntimeConfig } from "@/server/x402/config";
import type { X402ChainFamily } from "@/server/types";
import { getX402PaymentReceiptByHeaderHash } from "@/server/storage";
import { proofConsumer } from "@/server/x402/settlement/consume";
import { pricingEngine } from "@/server/x402/metering/pricing";

/**
 * Computes deterministic SHA-256 hash of a JSON payload.
 */
export function stableJsonHash(value: unknown): string {
  const serialized = JSON.stringify(value, Object.keys((value as Record<string, unknown>) ?? {}).sort());
  return createHash("sha256").update(serialized ?? "").digest("hex");
}

/**
 * Computes SHA-256 hash of the payment header signature.
 */
export function hashPaymentHeader(header: string): string {
  return createHash("sha256").update(header).digest("hex");
}

/**
 * Extracts payment signature header from request.
 */
export function getPaymentSignatureHeader(request: NextRequest | Request): string {
  return (
    request.headers.get("payment-signature") ??
    request.headers.get("x-payment-signature") ??
    request.headers.get("x-payment") ??
    request.headers.get("payment") ??
    ""
  ).trim();
}

/**
 * Extracts quote ID from request headers.
 */
export function getPaymentQuoteIdHeader(request: NextRequest | Request): string {
  return (
    request.headers.get("x-quote-id") ??
    request.headers.get("x-payment-quote-id") ??
    ""
  ).trim();
}

function getPaymentDetailHeaders(request: NextRequest | Request) {
  return {
    amount: (request.headers.get("x-payment-amount") ?? "").trim(),
    recipient: (request.headers.get("x-payment-recipient") ?? request.headers.get("x-pay-to") ?? "").trim(),
    network: (request.headers.get("x-payment-network") ?? "").trim(),
    asset: (request.headers.get("x-payment-asset") ?? "").trim(),
    payer: (request.headers.get("x-payment-payer") ?? "").trim(),
    transactionHash: (request.headers.get("x-payment-tx-hash") ?? "").trim(),
    settlementTimestamp: (request.headers.get("x-payment-settled-at") ?? "").trim(),
    quoteId: getPaymentQuoteIdHeader(request),
  };
}

function isExpired(settlementTimestamp: string, maxAgeSeconds: number): boolean {
  if (!settlementTimestamp) return false;
  const settledAt = new Date(settlementTimestamp).getTime();
  if (Number.isNaN(settledAt)) return false;
  const ageSeconds = (Date.now() - settledAt) / 1000;
  return ageSeconds > maxAgeSeconds;
}

function resolvePayerChainFamily(payer: string): X402ChainFamily | undefined {
  if (!payer) return undefined;
  if (/^0x[a-fA-F0-9]{40}$/.test(payer)) return "evm";
  if (/^G[A-Z2-7]{55}$/.test(payer)) return "stellar";
  return undefined;
}

function addressesMatch(left: string, right: string, chainFamily: X402ChainFamily): boolean {
  if (chainFamily === "stellar") return left === right;
  return left.toLowerCase() === right.toLowerCase();
}

function isValidTransactionHash(hash: string, chainFamily: X402ChainFamily): boolean {
  if (!hash) return true;
  if (chainFamily === "evm") return /^0x[a-fA-F0-9]{64}$/.test(hash);
  if (chainFamily === "stellar") return /^[a-fA-F0-9]{64}$/.test(hash);
  return true;
}

/**
 * Asserts freshness and validity of an incoming x402 payment presentation.
 */
export async function assertFreshX402Payment(input: {
  request: NextRequest | Request;
  requestBody: unknown;
  config: X402RuntimeConfig;
  quoteId?: string;
}) {
  const paymentSignature = getPaymentSignatureHeader(input.request);

  if (!paymentSignature) {
    return {
      ok: false as const,
      status: 402,
      error: "payment_required",
      detail: "Missing x402 PAYMENT-SIGNATURE header.",
    };
  }

  const paymentHeaderHash = hashPaymentHeader(paymentSignature);
  const existing = getX402PaymentReceiptByHeaderHash(paymentHeaderHash);
  const alreadyConsumed = await proofConsumer.isProofConsumed(paymentSignature);

  if (existing || alreadyConsumed) {
    return {
      ok: false as const,
      status: 409,
      error: "duplicate_x402_payment",
      detail: "This x402 payment signature was already used for a premium resource.",
      receiptId: existing?.id,
    };
  }

  const requestBodyHash = stableJsonHash(input.requestBody);
  const requestId = createHash("sha256")
    .update(`${input.config.protectedResource}:${paymentHeaderHash}:${requestBodyHash}`)
    .digest("hex")
    .slice(0, 32);

  const details = getPaymentDetailHeaders(input.request);
  const chainFamily = input.config.chainFamily;
  const quoteId = input.quoteId || details.quoteId;

  let requiredPrice = input.config.priceUsd;
  if (quoteId) {
    const quote = await pricingEngine.getQuote(quoteId);
    if (!quote) {
      return {
        ok: false as const,
        status: 402,
        error: "quote_not_found",
        detail: `Price quote ${quoteId} does not exist.`,
      };
    }
    if (!pricingEngine.isQuoteActive(quote)) {
      return {
        ok: false as const,
        status: 402,
        error: "quote_expired",
        detail: `Price quote ${quoteId} has expired.`,
      };
    }
    requiredPrice = quote.priceUsd;
  }

  if (details.amount && requiredPrice && details.amount !== requiredPrice) {
    return {
      ok: false as const,
      status: 402,
      error: "payment_amount_mismatch",
      detail: `Payment amount ${details.amount} does not match required ${requiredPrice}.`,
    };
  }

  if (details.recipient && input.config.payTo && !addressesMatch(details.recipient, input.config.payTo, chainFamily)) {
    return {
      ok: false as const,
      status: 402,
      error: "payment_recipient_mismatch",
      detail: "Payment recipient does not match the configured pay-to address.",
    };
  }

  if (details.network && input.config.network && details.network !== input.config.network) {
    return {
      ok: false as const,
      status: 402,
      error: "payment_network_mismatch",
      detail: `Payment network ${details.network} does not match required ${input.config.network}.`,
    };
  }

  if (details.asset && input.config.asset && details.asset !== input.config.asset) {
    return {
      ok: false as const,
      status: 402,
      error: "payment_asset_mismatch",
      detail: `Payment asset ${details.asset} does not match required ${input.config.asset}.`,
    };
  }

  if (details.payer) {
    const payerFamily = resolvePayerChainFamily(details.payer);

    if (!payerFamily) {
      return {
        ok: false as const,
        status: 402,
        error: "invalid_payer_identity",
        detail: "Payer address does not match EVM or Stellar format.",
      };
    }

    if (payerFamily !== chainFamily) {
      return {
        ok: false as const,
        status: 402,
        error: "payer_chain_family_mismatch",
        detail: `Payer identity chain family (${payerFamily}) does not match configured network (${chainFamily}).`,
      };
    }
  }

  if (details.transactionHash && !isValidTransactionHash(details.transactionHash, chainFamily)) {
    return {
      ok: false as const,
      status: 402,
      error: "invalid_transaction_hash",
      detail: `Transaction hash does not match ${chainFamily} format.`,
    };
  }

  if (isExpired(details.settlementTimestamp, input.config.paymentExpirySeconds)) {
    return {
      ok: false as const,
      status: 402,
      error: "payment_expired",
      detail: `Payment settlement has expired (max age ${input.config.paymentExpirySeconds}s).`,
    };
  }

  return {
    ok: true as const,
    paymentHeaderHash,
    paymentSignature,
    requestBodyHash,
    requestId,
    quoteId,
    paymentDetails: {
      amount: details.amount || requiredPrice,
      recipient: details.recipient || input.config.payTo,
      network: details.network || input.config.network,
      asset: details.asset || input.config.asset,
      payer: details.payer || undefined,
      transactionHash: details.transactionHash || undefined,
      settlementTimestamp: details.settlementTimestamp || undefined,
      chainFamily,
    },
  };
}
