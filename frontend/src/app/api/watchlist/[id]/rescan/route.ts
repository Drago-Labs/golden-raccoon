import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, checkRateLimitProfile } from "@/server/security/rateLimit";
import { getWatchlistEntry, rescanWatchlistEntry } from "@/server/discovery/watchlist";
import { listWatchlistHistory } from "@/server/discovery/watchlist";

const bodySchema = z.object({
  walletAddress: z.string().min(1).max(80),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rateLimited = checkRateLimitProfile(request, "watchlistRescan");

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { id } = await params;
    const entry = getWatchlistEntry(id);

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (entry.walletAddress.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Wallet does not own this entry" }, { status: 403 });
    }

    const result = await rescanWatchlistEntry(id, { walletAddress: parsed.data.walletAddress });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({
      entry: result.entry,
      newRun: result.newRun,
      classification: result.scan?.classification ?? result.newRun?.classification,
      classificationReasons: result.scan?.classificationReasons ?? result.newRun?.classificationReasons,
      confidence: result.scan?.confidence ?? result.newRun?.confidence,
      executionGuarantees: {
        serverCanSign: false,
        autoExecute: false,
        transactionPrepared: false,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rescan failed" }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rateLimited = checkRateLimit(request, { namespace: "watchlist:history", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const { id } = await params;

  return NextResponse.json({ runs: listWatchlistHistory(id) });
}
