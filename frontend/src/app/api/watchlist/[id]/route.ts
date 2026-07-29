import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { getWatchlistEntry, removeFromWatchlist } from "@/server/discovery/watchlist";

const querySchema = z.object({
  walletAddress: z.string().min(1).max(80),
});

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rateLimited = checkRateLimitProfile(request, "watchlistRescan");

  if (rateLimited) {
    return rateLimited;
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ walletAddress: url.searchParams.get("walletAddress") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const entry = getWatchlistEntry(id);

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (entry.walletAddress.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "Wallet does not own this entry" }, { status: 403 });
  }

  const removed = await removeFromWatchlist(id);

  return NextResponse.json({ ok: removed });
}
