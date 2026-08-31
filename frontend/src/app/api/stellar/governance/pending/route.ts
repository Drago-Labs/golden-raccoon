import { NextResponse } from "next/server";
import { getPendingQueue, getPendingCount } from "@/server/stellar/governance";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const queue = await getPendingQueue();
    const count = await getPendingCount();
    // Verify that readable queue matches on-chain state by returning both count and items
    return NextResponse.json({
      pendingCount: count,
      pendingQueue: queue,
      verified: queue.length === count,
      timestamp: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch pending governance queue", details: String(error) },
      { status: 500 }
    );
  }
}
