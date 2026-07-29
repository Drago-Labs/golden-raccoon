import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import type { X402RuntimeConfig } from "@/server/x402/config";
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
 * Extract the payer identity from an x402 payment header.
 * For Stellar payments, the payer is a Stellar account address (G...).
 * For EVM payments, the payer is an EVM address (0x...).
 */
export function extractPayerFromHeader(header: string): string | undefined {
  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const payload = JSON.parse(decoded) as Record<string, unknown>;

    if (payload?.accepted && typeof payload.accepted === "object") {
      const accepted = payload.accepted as Record<string, unknown>;
      const network = String(accepted.network ?? "");

      if (network.startsWith("stellar:")) {
        if (typeof accepted.payTo === "string" && StrKey.isValidEd25519PublicKey(accepted.payTo)) {
          return accepted.payTo;
        }
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Determine whether a payment header is for a Stellar network.
 */
export function isStellarPaymentHeader(header: string): boolean {
  try {
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const payload = JSON.parse(decoded) as Record<string, unknown>;

    if (payload?.accepted && typeof payload.accepted === "object") {
      const accepted = payload.accepted as Record<string, unknown>;
      const network = String(accepted.network ?? "");
      return network.startsWith("stellar:");
    }

    return false;
  } catch {
    return false;
  }
}

export function assertFreshX402Payment(input: { request: NextRequest | Request; requestBody: unknown; config: X402RuntimeConfig }) {
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

  const isStellar = isStellarPaymentHeader(paymentSignature);

  return {
    ok: true as const,
    paymentHeaderHash,
    requestBodyHash: stableJsonHash(input.requestBody),
    requestId: createHash("sha256")
      .update(`${input.config.protectedResource}:${paymentHeaderHash}:${stableJsonHash(input.requestBody)}`)
      .digest("hex")
      .slice(0, 32),
    isStellar,
    payer: extractPayerFromHeader(paymentSignature),
  };
}
