import { type NextRequest, NextResponse } from "next/server";
import { getX402RuntimeConfig, validateX402RuntimeConfig } from "@/server/x402/config";
import { pricingEngine } from "@/server/x402/metering/pricing";
import type { X402ChainFamily } from "@/server/types";

export const runtime = "nodejs";

/**
 * Handles GET requests returning terms and current pricing or specific quote details.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = getX402RuntimeConfig();
  const validation = validateX402RuntimeConfig(config);
  const quoteId = request.nextUrl.searchParams.get("quoteId");

  if (quoteId) {
    const quote = await pricingEngine.getQuote(quoteId);
    if (!quote) {
      return NextResponse.json({ error: "quote_not_found", message: `Quote ${quoteId} not found` }, { status: 404 });
    }
    return NextResponse.json({
      quote,
      quoteValid: pricingEngine.isQuoteActive(quote),
      active: pricingEngine.isQuoteActive(quote),
    });
  }

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
            available: false,
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
      receiptRetentionSeconds: config.receiptRetentionSeconds,
      paymentExpirySeconds: config.paymentExpirySeconds,
      quoteTtlSeconds: 300,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  );
}

/**
 * Handles POST requests to issue a time-locked quote.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getX402RuntimeConfig();
  let body: {
    resource?: string;
    chainFamily?: X402ChainFamily;
    network?: string;
    asset?: string;
    payTo?: string;
    ttlSeconds?: number;
  } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const chainFamily = body.chainFamily ?? config.chainFamily;
  const isStellar = chainFamily === "stellar";
  const network = body.network ?? (isStellar ? "stellar:testnet" : config.network);
  const asset = body.asset ?? (isStellar ? (config.stellarUsdcContract ?? "USDC") : config.asset);
  const payTo = body.payTo ?? (isStellar ? (config.stellarPayTo ?? "") : config.payTo);
  const resource = body.resource ?? config.protectedResource;
  const ttlSeconds = body.ttlSeconds ?? config.paymentExpirySeconds;

  const quote = await pricingEngine.issueQuote({
    resource,
    priceUsd: config.priceUsd,
    chainFamily,
    network,
    asset,
    payTo,
    ttlSeconds,
  });

  return NextResponse.json({
    quote,
    quoteId: quote.id,
    priceUsd: quote.priceUsd,
  }, { status: 201 });
}
