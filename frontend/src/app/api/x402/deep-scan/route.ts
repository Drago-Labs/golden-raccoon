import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { z } from "zod";
import { runTokenScan } from "@/server/scan/tokenScan";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createX402PaymentReceipt } from "@/server/storage";
import { getX402RouteConfig, getX402RuntimeConfig } from "@/server/x402/config";
import { assertFreshX402Payment } from "@/server/x402/guards";
import { createX402ResourceServer } from "@/server/x402/server";

export const runtime = "nodejs";

const querySchema = z.object({
  query: z.string().min(1).max(260),
  chain: z.string().min(1).max(40).optional(),
  walletAddress: z.string().min(1).max(80).optional(),
});

async function deepScanHandler(request: NextRequest): Promise<NextResponse<unknown>> {
  const rateLimited = checkRateLimit(request, { namespace: "x402:deep-scan", limit: 10, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const config = getX402RuntimeConfig();
  const parsed = querySchema.safeParse({
    query: request.nextUrl.searchParams.get("query") ?? "",
    chain: request.nextUrl.searchParams.get("chain") ?? undefined,
    walletAddress: request.nextUrl.searchParams.get("walletAddress") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const guard = assertFreshX402Payment({ request, requestBody: parsed.data, config });

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error, detail: guard.detail, receiptId: guard.receiptId }, { status: guard.status });
  }

  const receipt = createX402PaymentReceipt({
    requestId: guard.requestId,
    paymentHeaderHash: guard.paymentHeaderHash,
    walletAddress: parsed.data.walletAddress,
    network: config.network,
    asset: config.asset,
    amount: config.priceUsd,
    priceUsd: config.priceUsd,
    payTo: config.payTo,
    facilitatorUrl: config.facilitatorUrl,
    protectedResource: config.protectedResource,
    requestBodyHash: guard.requestBodyHash,
    verificationStatus: "verified",
  });
  const scan = await runTokenScan(parsed.data.query, parsed.data.chain, parsed.data.walletAddress);

  return NextResponse.json({
    premium: {
      unlocked: true,
      tier: "deep_scan",
      provider: "x402",
      protectedResource: config.protectedResource,
      receiptId: receipt.id,
      note: "x402 payment was verified before premium analysis ran. Settlement is handled by the x402 resource server after this successful response.",
    },
    scan,
  });
}

const x402Server = createX402ResourceServer();

export const GET = withX402(deepScanHandler, getX402RouteConfig(), x402Server);
