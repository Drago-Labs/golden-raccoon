import { type NextRequest, NextResponse } from "next/server";
import { settlementLedger } from "@/server/x402/settlement/ledger";
import type { SettlementStatus } from "@/server/x402/settlement/types";

export const runtime = "nodejs";

/**
 * Handles GET requests to list settlement records, supporting owed and refund queries.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const status = (request.nextUrl.searchParams.get("status") as SettlementStatus | null) ?? undefined;
  const owedOnly = request.nextUrl.searchParams.get("owed") === "true";
  const payer = request.nextUrl.searchParams.get("payer") ?? undefined;
  const chainFamily = request.nextUrl.searchParams.get("chainFamily") ?? undefined;

  let settlements = settlementLedger.list();

  if (owedOnly) {
    settlements = settlementLedger.listOwed();
  }

  if (status) {
    settlements = settlements.filter((s) => s.status === status);
  }

  if (chainFamily) {
    settlements = settlements.filter((s) => s.chainFamily === chainFamily);
  }

  if (payer) {
    settlements = settlements.filter(
      (s) =>
        s.payerRaw?.toLowerCase() === payer.toLowerCase() ||
        s.payerRedacted?.toLowerCase() === payer.toLowerCase(),
    );
  }

  return NextResponse.json({
    count: settlements.length,
    settlements,
  });
}

/**
 * Handles POST requests to transition owed settlements into refunded status.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { action?: string; idempotencyKey?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.action !== "refund" || !body.idempotencyKey) {
    return NextResponse.json(
      { error: "invalid_request", message: "Body must contain action 'refund' and an idempotencyKey" },
      { status: 400 },
    );
  }

  try {
    const updated = await settlementLedger.refund(body.idempotencyKey);
    return NextResponse.json({
      success: true,
      settlement: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refund processing failed";
    return NextResponse.json({ error: "refund_failed", message }, { status: 409 });
  }
}
