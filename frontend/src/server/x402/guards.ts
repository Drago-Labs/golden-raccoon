import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { X402RuntimeConfig } from "@/server/x402/config";
import type { X402ChainFamily } from "@/server/types";
import { getX402PaymentReceiptByHeaderHash } from "@/server/storage";

export function stableJsonHash(value: unknown) {
  const serialized = JSON.stringify(value, Object.keys((value as Record<string, unknown>) ?? {}).sort());

  return createHash("sha256").update(serialized ?? "").digest("hex");
}

export function hashPaymentHeader(header: string) {
  return createHash("sha256").update(header).digest("hex");
}

export function getPaymentSignatureHeader(request: NextRequest | Request) {
  return (
    request.headers.get("payment-signature") ??
    request.headers.get("x-payment-signature") ??
    request.headers.get("x-payment") ??
    request.headers.get("payment") ??
    ""
  ).trim();
}

/**
 * Extracts payment detail headers that the x402 middleware attaches
 * after verifying the settlement with the facilitator.
 *
 * These are trusted only because the x402 resource server verified
 * them before forwarding the request. Payment success is never
 * inferred from an unverified client claim.
 */
function getPaymentDetailHeaders(request: NextRequest | Request) {
  return {
    amount: (request.headers.get("x-payment-amount") ?? "").trim(),
    recipient: (request.headers.get("x-payment-recipient") ?? request.headers.get("x-pay-to") ?? "").trim(),
    network: (request.headers.get("x-payment-network") ?? "").trim(),
    asset: (request.headers.get("x-payment-asset") ?? "").trim(),
    payer: (request.headers.get("x-payment-payer") ?? "").trim(),
    transactionHash: (request.headers.get("x-payment-tx-hash") ?? "").trim(),
    settlementTimestamp: (request.headers.get("x-payment-settled-at") ?? "").trim(),
  };
}

function isExpired(settlementTimestamp: string, maxAgeSeconds: number): boolean {
  if (!settlementTimestamp) return false;
  const settledAt = new Date(settlementTimestamp).getTime();
  if (Number.isNaN(settledAt)) return false;
  const ageSeconds = (Date.now() - settledAt) / 1000;
  return ageSeconds > maxAgeSeconds;
}

/**
 * Resolves which chain family a payment address belongs to.
 * Used to validate payer identity without forcing Stellar hashes
 * into EVM formats.
 */
function resolvePayerChainFamily(payer: string): X402ChainFamily | undefined {
  if (!payer) return undefined;
  if (/^0x[a-fA-F0-9]{40}$/.test(payer)) return "evm";
  if (/^G[A-Z2-7]{55}$/.test(payer)) return "stellar";
  return undefined;
}

/**
 * Compares two recipient/pay-to addresses respecting chain-family
 * case sensitivity rules. EVM addresses are case-insensitive;
 * Stellar addresses use case-sensitive base32.
 */
function addressesMatch(left: string, right: string, chainFamily: X402ChainFamily): boolean {
  if (chainFamily === "stellar") return left === right;
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Validates a transaction hash by chain family.
 */
function isValidTransactionHash(hash: string, chainFamily: X402ChainFamily): boolean {
  if (!hash) return true; // optional field
  if (chainFamily === "evm") return /^0x[a-fA-F0-9]{64}$/.test(hash);
  if (chainFamily === "stellar") return /^[a-fA-F0-9]{64}$/.test(hash);
  return true;
}

export function assertFreshX402Payment(input: {
  request: NextRequest | Request;
  requestBody: unknown;
  config: X402RuntimeConfig;
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

  if (existing) {
    return {
      ok: false as const,
      status: 409,
      error: "duplicate_x402_payment",
      detail: "This x402 payment signature was already used for a premium resource.",
      receiptId: existing.id,
    };
  }

  // Verify binding: the payment must match the exact request body/resource.
  const requestBodyHash = stableJsonHash(input.requestBody);
  const requestId = createHash("sha256")
    .update(`${input.config.protectedResource}:${paymentHeaderHash}:${requestBodyHash}`)
    .digest("hex")
    .slice(0, 32);

  // Verify payment details from x402 middleware headers.
  // Never trust unverified client claims for payment success.
  const details = getPaymentDetailHeaders(input.request);
  const chainFamily = input.config.chainFamily;

  if (details.amount && input.config.priceUsd && details.amount !== input.config.priceUsd) {
    return {
      ok: false as const,
      status: 402,
      error: "payment_amount_mismatch",
      detail: `Payment amount ${details.amount} does not match required ${input.config.priceUsd}.`,
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

  // Verify payer identity by chain family.
  // Stellar hashes and accounts are not forced into EVM formats.
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

  // Verify payment expiry.
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
    requestBodyHash,
    requestId,
    paymentDetails: {
      amount: details.amount || input.config.priceUsd,
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
