import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { NetworkCongestionError, type CongestionErrorCode } from "@/server/research/network-congestion/errors";
import { CONGESTION_LIMITS } from "@/server/research/network-congestion/limits";
import { createHorizonLedgerReader } from "@/server/research/network-congestion/ledgerReader";
import { explainCongestion } from "@/server/research/network-congestion/service";

/**
 * Read-only ledger capacity, surge periods, and separated inclusion fees.
 *
 * The window is explicit. Nothing is cached, and the route has no submit path.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

function statusFor(code: CongestionErrorCode): number {
  switch (code) {
    case "provider_unavailable":
    case "passphrase_mismatch":
      return 503;
    case "provider_timeout":
      return 504;
    case "ledger_not_found":
    case "timestamp_not_closed":
    case "timestamp_unresolved":
      return 404;
    default:
      return 400;
  }
}

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "network-congestion", limit: 20, windowMs: 60_000 });

  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > CONGESTION_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: CONGESTION_LIMITS.maxRequestBytes }, { status: 413, headers: noStore });
  }

  let text: string;

  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  if (text.length > CONGESTION_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: CONGESTION_LIMITS.maxRequestBytes }, { status: 413, headers: noStore });
  }

  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  try {
    const report = await explainCongestion(body, createHorizonLedgerReader());

    return NextResponse.json({ report }, { headers: noStore });
  } catch (error) {
    if (error instanceof NetworkCongestionError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: statusFor(error.code), headers: noStore },
      );
    }

    return NextResponse.json({ error: "network_congestion_failed" }, { status: 500, headers: noStore });
  }
}
