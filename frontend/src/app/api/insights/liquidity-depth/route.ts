import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import {
  getLiquidityDepth,
  liquidityDepthQuerySchema,
  liquidityDepthRequestSchema,
} from "@/server/research/liquidity-depth";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Read-only analysis endpoint providing liquidity depth and trade-size capacity analysis.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = checkRateLimit(request, {
    namespace: "insights:liquidity-depth",
    limit: 60,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const rawParams = {
    base: searchParams.get("base") || undefined,
    quote: searchParams.get("quote") || undefined,
    network: searchParams.get("network") || undefined,
    side: searchParams.get("side") || undefined,
    venueId: searchParams.get("venueId") || undefined,
    sizes: searchParams.get("sizes") || undefined,
    fixture: searchParams.get("fixture") || undefined,
  };

  const parsed = liquidityDepthQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.format() },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const { base, quote, network, side, sizes } = parsed.data;
  const parsedSizes = sizes ? sizes.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  try {
    const isStellar = network.startsWith("stellar");
    const result = await getLiquidityDepth({
      network,
      side,
      sizes: parsedSizes,
      baseAsset: {
        symbol: base.toUpperCase(),
        addressOrCode: isStellar ? (base.toUpperCase() === "XLM" ? "native" : base) : base,
        decimals: isStellar ? 7 : 18,
        chainFamily: isStellar ? "stellar" : "evm",
        network,
      },
      quoteAsset: {
        symbol: quote.toUpperCase(),
        addressOrCode: quote,
        decimals: isStellar ? 7 : 6,
        chainFamily: isStellar ? "stellar" : "evm",
        network,
      },
    });

    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze liquidity depth";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

/**
 * Read-only analysis endpoint accepting custom snapshots or parameters for evaluation.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = checkRateLimit(request, {
    namespace: "insights:liquidity-depth",
    limit: 40,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const parsed = liquidityDepthRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.format() },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const { venue, side, sizes, network, baseSymbol, quoteSymbol } = parsed.data;

    const result = await getLiquidityDepth({
      venue,
      side,
      sizes,
      network,
      baseAsset: baseSymbol
        ? {
            symbol: baseSymbol.toUpperCase(),
            addressOrCode: baseSymbol,
            decimals: 18,
            chainFamily: "evm",
            network: network || "ethereum",
          }
        : undefined,
      quoteAsset: quoteSymbol
        ? {
            symbol: quoteSymbol.toUpperCase(),
            addressOrCode: quoteSymbol,
            decimals: 6,
            chainFamily: "evm",
            network: network || "ethereum",
          }
        : undefined,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process liquidity depth request";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
