import { NextResponse, type NextRequest } from "next/server";
import { createHorizonHolderReader } from "@/server/research/stellar-holders/holderReader";
import { HOLDER_LIMITS, HolderDistributionError, measureHolderDistribution } from "@/server/research/stellar-holders";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Read-only holder distribution for one issued classic asset.
 *
 * The route validates the body, then calls the feature service with a Horizon
 * reader. It writes nothing and caches nothing.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "stellar-holders", limit: 20, windowMs: 60_000 });

  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > HOLDER_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", message: "The holder distribution request is too large.", limitBytes: HOLDER_LIMITS.maxRequestBytes },
      { status: 413, headers: noStore },
    );
  }

  let text: string;

  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "The holder distribution request could not be read." }, { status: 400, headers: noStore });
  }

  if (text.length > HOLDER_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", message: "The holder distribution request is too large.", limitBytes: HOLDER_LIMITS.maxRequestBytes },
      { status: 413, headers: noStore },
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "The holder distribution request is not JSON." }, { status: 400, headers: noStore });
  }

  try {
    const report = await measureHolderDistribution(body, createHorizonHolderReader());

    return NextResponse.json({ report }, { headers: noStore });
  } catch (error) {
    if (error instanceof HolderDistributionError) {
      const status = error.code === "payload_too_large" ? 413 : 400;

      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status, headers: noStore },
      );
    }

    return NextResponse.json(
      { error: "provider_unavailable", message: "The holder distribution could not be read." },
      { status: 503, headers: noStore },
    );
  }
}
