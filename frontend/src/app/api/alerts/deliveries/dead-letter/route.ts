import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";
import {
  getDeadLetterDepth,
  listDeadLetters,
} from "@/server/observability/delivery/deadLetter";
import { replayDeadLetterQueue } from "@/server/observability/alertDeliveries";

const querySchema = z.object({
  walletAddress: z.string().optional(),
});

const bulkReplaySchema = z.object({
  walletAddress: z.string().optional(),
});

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRead");
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    walletAddress: url.searchParams.get("walletAddress") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) return session.response;
  const wallet = session.wallet!;

  const items = listDeadLetters(wallet);
  const depth = getDeadLetterDepth(wallet);

  return withCacheHeaders(
    NextResponse.json({
      depth,
      items,
    }),
    "alerts",
  );
}

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertAcknowledge");
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const parsed = bulkReplaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) return session.response;
  const wallet = session.wallet!;

  const result = await replayDeadLetterQueue(wallet);

  return withCacheHeaders(NextResponse.json(result), "alerts");
}
