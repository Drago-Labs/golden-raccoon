import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createWatchlistEntry, listWatchlistEntries } from "@/server/storage";
import { checkRateLimit } from "@/server/security/rateLimit";
import { isStellarAccountAddress, isWalletAddressForChain } from "@/lib/chainIdentity";
import { parseWatchlistAsset } from "@/server/watchlist/validation";
import type { WatchlistEntryInput } from "@/server/types";

const addBodySchema = z.object({
  walletAddress: z.string().min(1, "Wallet address is required"),
  chainFamily: z.enum(["evm", "stellar"]),
  network: z.string().min(1, "Network is required"),
  assetIdentifier: z.string().optional(),
  assetType: z.enum(["evm_contract", "stellar_native", "stellar_classic", "stellar_contract"]),
  symbol: z.string().min(1).max(32, "Symbol too long"),
  name: z.string().max(80, "Name too long").optional(),
});

function validateWalletForQuery(walletAddress: string | null): { ok: true; address: string } | NextResponse {
  if (!walletAddress) {
    return NextResponse.json(
      { error: "missing_wallet", detail: "walletAddress query parameter is required." },
      { status: 400 },
    );
  }

  const trimmed = walletAddress.trim();

  if (!isStellarAccountAddress(trimmed) && !isWalletAddressForChain(trimmed, "ethereum")) {
    return NextResponse.json(
      { error: "invalid_wallet_address", detail: "walletAddress must be a valid EVM or Stellar address." },
      { status: 400 },
    );
  }

  return { ok: true, address: trimmed };
}

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "watchlist:read", limit: 80, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const walletCheck = validateWalletForQuery(request.nextUrl.searchParams.get("walletAddress"));

  if (walletCheck instanceof NextResponse) return walletCheck;

  const entries = await listWatchlistEntries(walletCheck.address);
  const noStore = NextResponse.json(entries);

  noStore.headers.set("Cache-Control", "no-store");

  return noStore;
}

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "watchlist:write", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));

  // First pass: structural validation of known fields. Asset/identity checks
  // happen inside `parseWatchlistAsset` so we can return stable error codes.
  const parsed = addBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = parseWatchlistAsset({
    walletAddress: parsed.data.walletAddress,
    chainFamily: parsed.data.chainFamily,
    network: parsed.data.network,
    assetType: parsed.data.assetType,
    assetIdentifier: parsed.data.assetIdentifier ?? "",
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.code, detail: result.message },
      { status: 400 },
    );
  }

  try {
    const entry = await createWatchlistEntry({
      walletAddress: parsed.data.walletAddress,
      chainFamily: result.chainFamily,
      network: result.network,
      assetIdentifier: result.assetIdentifier,
      assetType: result.assetType,
      symbol: parsed.data.symbol,
      name: parsed.data.name,
    } satisfies WatchlistEntryInput);

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      return NextResponse.json({ error: "duplicate_entry", detail: error.message }, { status: 409 });
    }

    return NextResponse.json({ error: "internal_error", detail: "Could not add watchlist entry." }, { status: 500 });
  }
}
