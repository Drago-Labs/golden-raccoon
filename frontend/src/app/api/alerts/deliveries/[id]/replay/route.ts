import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";
import { replayAlertDelivery } from "@/server/observability/alertDeliveries";

const bodySchema = z.object({
  walletAddress: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const rateLimited = checkRateLimitProfile(request, "alertAcknowledge");
  if (rateLimited) return rateLimited;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing delivery ID." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) return session.response;
  const wallet = session.wallet!;

  const result = await replayAlertDelivery(id, wallet);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return withCacheHeaders(
    NextResponse.json({
      id: result.delivery.id,
      alertId: result.delivery.alertId,
      channel: result.delivery.channel,
      status: result.delivery.status,
      attemptCount: result.delivery.attemptCount,
      replayCount: result.delivery.replayCount ?? 0,
      lastReplayedAt: result.delivery.lastReplayedAt,
      attempts: result.delivery.attempts ?? [],
      terminal: result.delivery.terminal ?? false,
      ...(result.delivery.errorDetail ? { errorDetail: result.delivery.errorDetail } : {}),
      ...(result.delivery.providerMessageId ? { providerMessageId: result.delivery.providerMessageId } : {}),
      ...(result.delivery.sentAt ? { sentAt: result.delivery.sentAt } : {}),
    }),
    "alerts",
  );
}
