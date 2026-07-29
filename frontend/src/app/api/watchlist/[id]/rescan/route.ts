import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/server/security/rateLimit";
import { rescanWatchlistEntry, listWatchlistHistory } from "@/server/discovery/watchlist";
import { getWatchlistEntry } from "@/server/storage";
import { ensureStorageReady } from "@/server/storage";

const bodySchema = z.object({
  walletAddress: z.string().min(1).max(80),
});

const historyQuerySchema = z.object({
  walletAddress: z.string().min(1).max(80),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rateLimited = checkRateLimit(request, { namespace: "watchlist:rescan", limit: 15, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  await ensureStorageReady();

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { id } = await params;
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

  await ensureStorageReady();

  const { id } = await params;
  const url = new URL(request.url);
  const parsed = historyQuerySchema.safeParse({ walletAddress: url.searchParams.get("walletAddress") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Ownership check: entry must belong to the requesting wallet
  const entry = getWatchlistEntry(id);
  if (!entry || entry.walletAddress.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "Entry not found or does not belong to this wallet." }, { status: 404 });
  }

  return NextResponse.json({ runs: listWatchlistHistory(id) });
}
