import { NextResponse } from "next/server";
import { getX402RuntimeConfig, validateX402RuntimeConfig } from "@/server/x402/config";

export const runtime = "nodejs";

export async function GET() {
  const config = getX402RuntimeConfig();
  const validation = validateX402RuntimeConfig(config);

  const stellarTerms =
    config.stellarEnabled && config.stellarPayTo
      ? {
          stellarTestnet: {
            enabled: true,
            network: "stellar:testnet",
            asset: "USDC",
            assetContract: config.stellarUsdcContract,
            payTo: config.stellarPayTo,
            priceUsd: config.priceUsd,
            available: validation.ok,
          },
          stellarPubnet: {
            enabled: config.stellarPubnetEnabled,
            network: "stellar:pubnet",
            asset: "USDC",
            assetContract: config.stellarPubnetUsdcContract,
            payTo: config.stellarPubnetPayTo || null,
            priceUsd: config.priceUsd,
            available: false, // fail-closed: pubnet unavailable until proven
          },
        }
      : undefined;

  return NextResponse.json(
    {
      priceUsd: config.priceUsd,
      network: config.network,
      asset: config.asset,
      payTo: config.payTo,
      available: validation.ok,
      stellar: stellarTerms,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  );
}
