import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/server/security/rateLimit";
import { addToWatchlist, listWatchlist, removeFromWatchlist } from "@/server/discovery/watchlist";
import { ensureStorageReady } from "@/server/storage";
import { resolveWalletSession } from "@/server/security/walletSession";

const addBodySchema = z.object({
  action: z.enum(["add"]).default("add"),
  walletAddress: z.string().min(1).max(80).optional(),
  chain: z.string().min(1).max(40),
  network: z.string().max(40).optional(),
  contractAddress: z.string().max(80).optional(),
  pairAddress: z.string().max(120).optional(),
  symbol: z.string().max(32).optional(),
  tokenName: z.string().max(120).optional(),
  assetKey: z.string().max(180).optional(),
  issuer: z.string().max(64).optional(),
  assetType: z.enum(["native", "classic", "contract", "issuer_account", "sac", "sep41"]).optional(),
  source: z.enum(["dexscreener", "stellar_market", "manual"]).default("manual"),
  note: z.string().max(280).optional(),
});

const removeBodySchema = z.object({
  action: z.literal("remove"),
  entryId: z.string().min(1).max(120),
  walletAddress: z.string().min(1).max(80).optional(),
});

const listQuerySchema = z.object({
  walletAddress: z.string().min(1).max(80).optional(),
});

export async function GET(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "watchlist:list", limit: 60, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  await ensureStorageReady();

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({ walletAddress: url.searchParams.get("walletAddress") ?? undefined });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Wallet isolation: the session cookie is authoritative
  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) return session.response;

  return NextResponse.json({ entries: listWatchlist(session.wallet!) });
}

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "watchlist:add", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  await ensureStorageReady();

  const body = await request.json().catch(() => ({}));

  const parsedAdd = addBodySchema.safeParse({ ...body, action: "add" });

  if (parsedAdd.success) {
    // Wallet isolation: the session cookie is authoritative
    const session = resolveWalletSession(request, { suppliedWallet: parsedAdd.data.walletAddress });
    if (session.response) return session.response;
    const wallet = session.wallet!;

    const result = await addToWatchlist({
      walletAddress: wallet,
      chain: parsedAdd.data.chain,
      network: parsedAdd.data.network,
      contractAddress: parsedAdd.data.contractAddress,
      pairAddress: parsedAdd.data.pairAddress,
      symbol: parsedAdd.data.symbol,
      tokenName: parsedAdd.data.tokenName,
      assetKey: parsedAdd.data.assetKey,
      issuer: parsedAdd.data.issuer,
      assetType: parsedAdd.data.assetType,
      source: parsedAdd.data.source === "manual" ? "manual_watchlist" : parsedAdd.data.source,
      note: parsedAdd.data.note,
    });

    return result.ok
      ? NextResponse.json({ entry: result.entry, alreadyExisted: result.alreadyExisted })
      : NextResponse.json({ error: result.error }, { status: 422 });
  }

  const parsedRemove = removeBodySchema.safeParse({ ...body, action: "remove" });

  if (parsedRemove.success) {
    // Wallet isolation: the session cookie is authoritative
    const session = resolveWalletSession(request, { suppliedWallet: parsedRemove.data.walletAddress });
    if (session.response) return session.response;

    const entries = listWatchlist(session.wallet!);
    const owned = entries.find((entry) => entry.id === parsedRemove.data.entryId);

    if (!owned) {
      return NextResponse.json({ error: "Entry not found or does not belong to this wallet." }, { status: 404 });
    }

    const ok = await removeFromWatchlist(parsedRemove.data.entryId);

    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "Invalid watchlist request." }, { status: 400 });
}
