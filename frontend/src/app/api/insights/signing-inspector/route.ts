import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { SIGNING_LIMITS, SigningInspectorError } from "@/server/research/signing-inspector/schema";
import { inspectSigningPayload } from "@/server/research/signing-inspector/service";

/**
 * Stateless offline decoding of an unsigned payload.
 *
 * The handler performs no outbound I/O whatsoever — no RPC, no token metadata,
 * no simulation — writes nothing, and drops the payload when it returns. There
 * is no signer here and no path from this endpoint to a broadcast transaction:
 * its entire output is a description of bytes the caller already had.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "signing-inspector", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > SIGNING_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: SIGNING_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    const raw = await request.text();

    // Checked again after reading: a caller can declare any content-length.
    if (raw.length > SIGNING_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: SIGNING_LIMITS.maxRequestBytes }, { status: 413 });
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: inspectSigningPayload(body) }, { headers: noStore });
  } catch (error) {
    if (error instanceof SigningInspectorError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.code === "payload_too_large" ? 413 : 400, headers: noStore },
      );
    }

    return NextResponse.json({ error: "signing_inspection_failed" }, { status: 500, headers: noStore });
  }
}
