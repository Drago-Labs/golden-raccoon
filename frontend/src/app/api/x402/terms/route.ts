import { NextResponse } from "next/server";
import { getX402RuntimeConfig, validateX402RuntimeConfig } from "@/server/x402/config";

export const runtime = "nodejs";

export async function GET() {
  const config = getX402RuntimeConfig();
  const validation = validateX402RuntimeConfig(config);

  return NextResponse.json(
    {
      priceUsd: config.priceUsd,
      network: config.network,
      asset: config.asset,
      payTo: config.payTo,
      available: validation.ok,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  );
}
