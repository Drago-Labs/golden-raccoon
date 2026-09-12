import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import {
  ComparisonValidationError,
  compareRiskSnapshots,
  validateReportComparisonRequest,
} from "@/server/research/report-comparison";

function mapErrorCodeToStatus(code: string): number {
  switch (code) {
    case "cross_asset":
    case "cross_network":
    case "invalid_request":
      return 400;
    case "not_found":
      return 404;
    case "revoked":
    case "expired":
      return 410;
    case "tampered":
    case "unknown_version":
    case "invalid_snapshot":
      return 422;
    case "comparison_too_large":
      return 413;
    default:
      return 400;
  }
}

/**
 * Ephemeral endpoint that executes semantic comparison between two saved risk
 * snapshots, preserving canonical asset identities and integrity validations.
 * Returns no-store cache control headers.
 *
 * @param request - Incoming Next.js HTTP POST request.
 * @returns JSON response containing ReportComparisonDocument or structured error.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = checkRateLimit(request, {
    namespace: "insights:report-comparison",
    limit: 30,
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
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const validatedRequest = validateReportComparisonRequest(body);
    const comparison = await compareRiskSnapshots(validatedRequest);

    return NextResponse.json(comparison, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof ComparisonValidationError) {
      const status = mapErrorCodeToStatus(error.code);
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        {
          status,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    const message = error instanceof Error ? error.message : "Internal comparison processing error.";
    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  }
}
