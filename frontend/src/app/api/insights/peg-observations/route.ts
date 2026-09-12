import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { readWalletSessionCookie } from "@/server/security/walletSession";
import {
  analyzePegObservations,
  pegAnalysisQuerySchema,
  pegAnalysisRequestSchema,
} from "@/server/research/peg-observations";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Handles GET requests to evaluate stable-asset peg observations.
 * Supports canonical assets and preconfigured benchmark fixtures.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = checkRateLimit(request, {
    namespace: "insights:peg-observations",
    limit: 60,
    windowMs: 60_000,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { searchParams } = new URL(request.url);
  const rawParams = {
    symbol: searchParams.get("symbol") || undefined,
    network: searchParams.get("network") || undefined,
    chainFamily: searchParams.get("chainFamily") || undefined,
    addressOrIssuer: searchParams.get("addressOrIssuer") || undefined,
    thresholdBps: searchParams.get("thresholdBps") || undefined,
    gapToleranceMs: searchParams.get("gapToleranceMs") || undefined,
    fixture: searchParams.get("fixture") || undefined,
  };

  const parsed = pegAnalysisQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query_parameters", details: parsed.error.flatten() },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  try {
    const result = analyzePegObservations({
      assetId: {
        symbol: parsed.data.symbol,
        network: parsed.data.network,
        chainFamily: parsed.data.chainFamily,
        addressOrIssuer: parsed.data.addressOrIssuer,
      },
      thresholdBps: parsed.data.thresholdBps,
      gapToleranceMs: parsed.data.gapToleranceMs,
      fixture: parsed.data.fixture,
    });

    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json(
      { error: "peg_analysis_failed", message },
      { status: 422, headers: NO_CACHE_HEADERS },
    );
  }
}

/**
 * Handles POST requests to execute stateless peg deviation analysis on submitted observations.
 * Supports custom assets, explicit peg declarations, and reference conversion rates.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = checkRateLimit(request, {
    namespace: "insights:peg-observations:analyze",
    limit: 40,
    windowMs: 60_000,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let jsonBody: unknown;
  try {
    jsonBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json_body", message: "Failed to parse JSON body" },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const parsed = pegAnalysisRequestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", details: parsed.error.flatten() },
      { status: 400, headers: NO_CACHE_HEADERS },
    );
  }

  const sessionWallet = readWalletSessionCookie(request);
  const suppliedWallet = (jsonBody as { walletAddress?: string })?.walletAddress;
  if (suppliedWallet && sessionWallet && suppliedWallet.toLowerCase() !== sessionWallet.toLowerCase()) {
    return NextResponse.json(
      { error: "wallet_session_mismatch", message: "Supplied wallet does not match session" },
      { status: 403, headers: NO_CACHE_HEADERS },
    );
  }

  try {
    const result = analyzePegObservations(parsed.data);
    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json(
      { error: "peg_analysis_failed", message },
      { status: 422, headers: NO_CACHE_HEADERS },
    );
  }
}
