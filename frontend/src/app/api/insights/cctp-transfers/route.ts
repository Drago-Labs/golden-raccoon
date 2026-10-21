import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { fetchAttestation } from "@/server/research/cctp-transfers/attestationClient";
import { CCTP_TRANSFER_LIMITS } from "@/server/research/cctp-transfers/limits";
import { CctpTransferError } from "@/server/research/cctp-transfers/errors";
import { checkEvmNonceUsed } from "@/server/research/cctp-transfers/evmDestination";
import { decodeSourceBurn } from "@/server/research/cctp-transfers/sourceDecoder";
import { checkStellarNonceUsed } from "@/server/research/cctp-transfers/stellarDestination";
import { trackCctpTransfer } from "@/server/research/cctp-transfers/service";

/**
 * Read-only CCTP transfer tracking.
 *
 * Reads the source chain, Circle's attestation service, and the
 * destination chain under published bounds. Writes nothing and offers no
 * verdict on whether funds are safe.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "cctp-transfers", limit: 20, windowMs: 60_000 });
  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > CCTP_TRANSFER_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: CCTP_TRANSFER_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > CCTP_TRANSFER_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: CCTP_TRANSFER_LIMITS.maxRequestBytes }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const report = await trackCctpTransfer(body, {
      decodeSourceBurn,
      fetchAttestation,
      checkEvmNonceUsed,
      checkStellarNonceUsed,
    });
    return NextResponse.json({ report }, { headers: noStore });
  } catch (error) {
    if (error instanceof CctpTransferError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.code === "payload_too_large" ? 413 : 400, headers: noStore },
      );
    }
    return NextResponse.json({ error: "cctp_transfer_tracking_failed" }, { status: 500, headers: noStore });
  }
}
