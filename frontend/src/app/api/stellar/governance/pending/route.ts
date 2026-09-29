import { NextResponse } from "next/server";
import { readPendingQueue } from "@/server/stellar/governance";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await readPendingQueue();
  if (result.state === "provider_error" || result.state === "malformed" || result.state === "unsupported_version") {
    return NextResponse.json(
      { error: "Failed to fetch pending governance queue", state: result.state, warnings: result.warnings },
      { status: 502 },
    );
  }
  const active = result.items.filter((item) => !item.cancelled);
  return NextResponse.json({
    state: result.state,
    pendingCount: active.length,
    pendingQueue: active,
    verified: true,
    ledger: result.ledger,
    warnings: result.warnings,
    timestamp: result.observedAtSecs,
  });
}
