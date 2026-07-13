import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
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

  return {
    ok: true as const,
    paymentHeaderHash,
    requestBodyHash: stableJsonHash(input.requestBody),
    requestId: createHash("sha256")
      .update(`${input.config.protectedResource}:${paymentHeaderHash}:${stableJsonHash(input.requestBody)}`)
      .digest("hex")
      .slice(0, 32),
  };
}
