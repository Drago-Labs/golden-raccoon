import { NextResponse } from "next/server";
import { jsonError } from "@/server/api/errors";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getStellarSwapQuote } from "@/server/stellar/swap";
import type { StellarSwapQuote } from "@/server/types";

import {
  globalIdempotencyStore,
  assertValidIdempotencyKey,
  computePayloadFingerprint,
} from "@/server/transactions/idempotency";
import { attachBindingToStellarQuote } from "@/server/providers/quote/binding";

const bodySchema = z.object({
  chain: z.string().min(1).max(64),
  walletAddress: z.string().min(1),
  fromAsset: z.string().min(1),
  toAsset: z.string().min(1),
  fromIssuer: z.string().optional(),
  toIssuer: z.string().optional(),
  amount: z.number().min(0),
  slippageBps: z.number().min(0).max(10_000).optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
});

/**
 * POST /api/execute/quote
 *
 * Fetch a fresh quote that binds parameters to a cryptographic signature.
 * Client-supplied idempotency keys are supported for replay protection.
 *
 * Returns:
 * - 200 with fresh StellarSwapQuote and cryptographic binding on success
 * - 404 when no route is available (recommendation-only mode)
 * - 409 when idempotency key is replayed with mismatched payload
 * - 400 for invalid input
 * - 429 when rate limited
 */
export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "execute:quote", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return jsonError({ code: "validation_error", message: "Invalid input", status: 400, details: parsed.error.flatten() });
  }

  const { chain, walletAddress, fromAsset, toAsset, fromIssuer, toIssuer, amount, slippageBps } = parsed.data;

  const rawIdempotencyKey =
    request.headers.get("Idempotency-Key") ??
    request.headers.get("x-idempotency-key") ??
    parsed.data.idempotencyKey;

  const idempotencyKey = rawIdempotencyKey ? assertValidIdempotencyKey(rawIdempotencyKey) : undefined;
  let fingerprint: string | undefined;

  if (idempotencyKey) {
    fingerprint = computePayloadFingerprint(parsed.data);
    try {
      const gate = await globalIdempotencyStore.acquireOrWait<any>(idempotencyKey, walletAddress, fingerprint);
      if (gate.isReplay && gate.outcome) {
        return withCacheHeaders(NextResponse.json({
          ...gate.outcome,
          replayed: true,
        }), "execution");
      }
    } catch (err: any) {
      if (err.code === "idempotency_payload_mismatch" || err.statusCode === 409) {
        return jsonError({
          code: "idempotency_payload_mismatch",
          message: err.message ?? "Idempotency payload fingerprint mismatch on replay.",
          status: 409,
        });
      }
      throw err;
    }
  }

  try {
    // Fetch a brand-new quote — every call invalidates prior calldata
    const result = await getStellarSwapQuote({
      chain,
      walletAddress,
      fromAsset,
      toAsset,
      fromIssuer,
      toIssuer,
      amount,
      slippageBps,
    });

    if (!result.quote) {
      // No route available: recommendation-only mode, no executable payload
      return jsonError({ code: "not_found" as any, message: result.error ?? "No swap route available.", status: 404, legacy: { quote: null, unsupported: true, detail: "This pair has no available route. Approval is disabled; only a recommendation can be shown.", } });
    }

    const boundQuote = attachBindingToStellarQuote(result.quote);

    // ALWAYS return a fresh quote with current timestamp and cryptographic binding
    const freshQuote: StellarSwapQuote = {
      ...boundQuote,
      status: "fresh",
      fetchedAt: new Date().toISOString(),
      expiresAt: boundQuote.binding?.expiresAt
        ? new Date(boundQuote.binding.expiresAt).toISOString()
        : new Date(Date.now() + 30_000).toISOString(),
    };

    const responsePayload = {
      quote: freshQuote,
      quoteHash: freshQuote.quoteHash,
      quoteSignature: freshQuote.quoteSignature,
      binding: freshQuote.binding,
      unsupported: false,
      replayed: false,
      _meta: {
        previousCalldataInvalidated: true,
        refreshRequiredAfter: freshQuote.expiresAt,
      },
    };

    if (idempotencyKey) {
      globalIdempotencyStore.resolveKey(idempotencyKey, responsePayload);
    }

    return withCacheHeaders(NextResponse.json(responsePayload), "execution");
  } catch (error: any) {
    if (idempotencyKey) {
      globalIdempotencyStore.rejectKey(idempotencyKey, error);
    }
    const code = error?.code ?? "quote_failed";
    const status = error?.statusCode ?? (code === "idempotency_payload_mismatch" ? 409 : 500);
    return jsonError({ code: code as any, message: error instanceof Error ? error.message : "Failed to obtain quote.", status });
  }
}
