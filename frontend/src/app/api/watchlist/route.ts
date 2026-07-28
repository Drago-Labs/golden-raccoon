import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { listWatchlistEntries, createWatchlistEntry } from "@/server/storage";
import type { WatchlistEntryInput } from "@/server/types";

const addBodySchema = z.object({
  walletAddress: z.string().min(1, "Wallet address is required"),
  chainFamily: z.enum(["evm", "stellar"]),
  network: z.string().min(1, "Network is required"),
  assetIdentifier: z.string().min(1, "Asset identifier is required"),
  assetType: z.enum(["evm_contract", "stellar_native", "stellar_classic", "stellar_contract"]),
  symbol: z.string().min(1).max(32, "Symbol too long"),
  name: z.string().max(80, "Name too long").optional(),
});

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "watchlist:read", limit: 80, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const walletAddress = request.nextUrl.searchParams.get("walletAddress") ?? undefined;
  const entries = listWatchlistEntries(walletAddress);

  return withCacheHeaders(NextResponse.json(entries), "watchlist");
}

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "watchlist:write", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = addBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const entry = createWatchlistEntry(parsed.data as WatchlistEntryInput);

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      return NextResponse.json({ error: "duplicate_entry", detail: error.message }, { status: 409 });
    }

    return NextResponse.json({ error: "internal_error", detail: "Could not add watchlist entry." }, { status: 500 });
  }
}
