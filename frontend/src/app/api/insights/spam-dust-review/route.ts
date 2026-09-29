import { NextResponse, type NextRequest } from "next/server";
import { SPAM_DUST_LIMITS, SpamDustError } from "@/server/research/spam-dust-review/schema";
import { reviewSpamDust } from "@/server/research/spam-dust-review/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Ephemeral spam/dust review.
 *
 * Operates on holdings the caller already holds. Persists nothing, fetches no
 * token URL, and never mutates portfolio records.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "spam-dust-review", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > SPAM_DUST_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: SPAM_DUST_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > SPAM_DUST_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: SPAM_DUST_LIMITS.maxRequestBytes }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const report = reviewSpamDust(body);
    // Route privacy: never echo wallet-shaped secrets beyond the declared walletId.
    return NextResponse.json(
      { report },
      {
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch (error) {
    if (error instanceof SpamDustError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json({ error: "spam_dust_review_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
