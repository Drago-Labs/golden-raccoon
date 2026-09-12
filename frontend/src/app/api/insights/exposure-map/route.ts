import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getPortfolioSnapshot } from "@/server/portfolio/getPortfolio";
import { generateExposureMap } from "@/server/research/exposure-map/service";
import { RelationshipDeclarationSchema } from "@/server/research/exposure-map/schema";
import type { RawHoldingInput } from "@/server/research/exposure-map/types";
import { z } from "zod";

const PostExposureMapPayloadSchema = z.object({
  walletAddress: z.string().optional(),
  chain: z.string().optional(),
  holdings: z.array(z.record(z.string(), z.unknown())).optional(),
  customRelationships: z.array(RelationshipDeclarationSchema).optional(),
});

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Read-only analysis endpoint providing portfolio exposure mapping across shared dependencies.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = checkRateLimit(request, {
    namespace: "insights:exposure-map",
    limit: 40,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("walletAddress") || undefined;
  const chain = searchParams.get("chain") || undefined;

  try {
    const { portfolio } = await getPortfolioSnapshot(walletAddress, chain);
    const exposureMap = generateExposureMap({
      walletAddress: portfolio.walletAddress,
      chain,
      holdings: portfolio.holdings,
    });

    return NextResponse.json(exposureMap, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to calculate exposure map";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

/**
 * Read-only analysis endpoint accepting explicit holdings and custom relationship declarations.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = checkRateLimit(request, {
    namespace: "insights:exposure-map",
    limit: 40,
    windowMs: 60_000,
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON payload in request body." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const parsed = PostExposureMapPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", details: parsed.error.issues },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { walletAddress, chain, holdings, customRelationships } = parsed.data;

  try {
    let targetHoldings: RawHoldingInput[] | undefined = holdings as RawHoldingInput[] | undefined;
    let resolvedWallet = walletAddress;

    if (!targetHoldings && walletAddress) {
      const { portfolio } = await getPortfolioSnapshot(walletAddress, chain);
      targetHoldings = portfolio.holdings as unknown as RawHoldingInput[];
      resolvedWallet = portfolio.walletAddress;
    }

    const exposureMap = generateExposureMap({
      walletAddress: resolvedWallet,
      chain,
      holdings: targetHoldings || [],
      customRelationships,
    });

    return NextResponse.json(exposureMap, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process exposure map request";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
