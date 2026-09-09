import { type NextRequest, NextResponse } from "next/server";
import {
  receiptManager,
  ReceiptNotFoundError,
  ReceiptExpiredError,
  ResourceMismatchError,
  ReceiptVerificationError,
} from "@/server/x402/settlement/receipts";

export const runtime = "nodejs";

/**
 * Handles GET requests to verify, inspect, or redeem a verifiable settlement receipt.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const receiptId = params.id;
  const requestedResource =
    request.nextUrl.searchParams.get("resource") ??
    request.headers.get("x-resource") ??
    undefined;

  if (!requestedResource) {
    const receipt = await receiptManager.getReceipt(receiptId);
    if (!receipt) {
      return NextResponse.json(
        { error: "receipt_not_found", message: `Receipt ${receiptId} not found` },
        { status: 404 },
      );
    }
    return NextResponse.json({ receipt, redeemed: false });
  }

  try {
    const { receipt, result } = await receiptManager.redeemReceipt({
      receiptId,
      requestedResource,
      now: Date.now(),
    });

    return NextResponse.json({
      receipt,
      result,
      redeemed: true,
    });
  } catch (error) {
    if (error instanceof ReceiptNotFoundError) {
      return NextResponse.json(
        { error: "receipt_not_found", message: error.message },
        { status: 404 },
      );
    }
    if (error instanceof ReceiptExpiredError) {
      return NextResponse.json(
        { error: "receipt_expired", message: error.message },
        { status: 410 },
      );
    }
    if (error instanceof ResourceMismatchError) {
      return NextResponse.json(
        { error: "resource_mismatch", message: error.message },
        { status: 403 },
      );
    }
    if (error instanceof ReceiptVerificationError) {
      return NextResponse.json(
        { error: "receipt_verification_failed", message: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "internal_error", message: "Failed to redeem receipt" },
      { status: 500 },
    );
  }
}
