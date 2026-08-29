import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { verifyErasureReceipt } from "@/server/privacy/retention/receipt";
import type { ErasureReceipt } from "@/server/privacy/retention/receipt";

/**
 * POST /api/wallet-privacy/erasure-receipt
 *
 * Verify a tamper-evident erasure receipt returned by the delete endpoint.
 * The receipt body is re-hashed canonically and compared against the stored sha256.
 * This endpoint contains no authenticated state — anyone who holds a receipt can verify it.
 */
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRead");
  if (rateLimited) return rateLimited;

  let receipt: ErasureReceipt;
  try {
    const body = await request.json();
    if (!body?.receipt || typeof body.receipt !== "object") {
      return NextResponse.json(
        { error: "receipt_missing", detail: "Provide { receipt: {...} } in the request body." },
        { status: 400 },
      );
    }
    receipt = body.receipt as ErasureReceipt;
  } catch {
    return NextResponse.json(
      { error: "invalid_json", detail: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const result = verifyErasureReceipt(receipt);

  const response = NextResponse.json({
    valid: result.valid,
    issues: result.issues,
    computedSha256: result.computedSha256,
    storedSha256: receipt.sha256,
    receiptId: receipt.body?.receiptId,
    erasedAt: receipt.body?.erasedAt,
    chainFamily: receipt.body?.chainFamily,
    residueCheckPassed: receipt.body?.residueCheckPassed,
    totalDeleted: receipt.body?.totalDeleted,
    totalAnonymized: receipt.body?.totalAnonymized,
  });

  response.headers.set("Cache-Control", "no-store");
  return response;
}
