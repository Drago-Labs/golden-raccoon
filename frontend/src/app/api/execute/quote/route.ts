import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getStellarSwapQuote } from "@/server/stellar/swap";
import type { StellarSwapQuote } from "@/server/types";

const bodySchema = z.object({
  chain: z.string().min(1).max(64),
  walletAddress: z.string().min(1),
  fromAsset: z.string().min(1),
  toAsset: z.string().min(1),
  fromIssuer: z.string().optional(),
  toIssuer: z.string().optional(),
  amount: z.number().min(0),
  slippageBps: z.number().min(0).max(10_000).optional(),
});

/**
 * POST /api/execute/quote
 *
 * Fetch a fresh quote that ALWAYS invalidates previous calldata/operation data.
 * Each request produces a brand-new quote with its own fetchedAt/expiresAt window.
 * Clients MUST discard any previously cached quote, calldata, or operation payload.
 *
 * Returns:
 * - 200 with fresh StellarSwapQuote on success
 * - 404 when no route is available (recommendation-only mode)
 * - 400 for invalid input
 * - 429 when rate limited
 */
export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "execute:quote", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { chain, walletAddress, fromAsset, toAsset, fromIssuer, toIssuer, amount, slippageBps } = parsed.data;

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
    return NextResponse.json({
      quote: null,
      error: result.error ?? "No swap route available.",
      unsupported: true,
      detail: "This pair has no available route. Approval is disabled; only a recommendation can be shown.",
    }, { status: 404 });
  }

  // ALWAYS return a fresh quote with current timestamp — never reuse stale data
  const freshQuote: StellarSwapQuote = {
    ...result.quote,
    status: "fresh",
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30_000).toISOString(), // 30s TTL
  };

  return withCacheHeaders(NextResponse.json({
    quote: freshQuote,
    unsupported: false,
    _meta: {
      previousCalldataInvalidated: true,
      refreshRequiredAfter: freshQuote.expiresAt,
    },
  }), "execution");
}
