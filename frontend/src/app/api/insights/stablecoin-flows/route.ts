import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { STABLECOIN_FLOW_LIMITS, StablecoinFlowError, trackStablecoinFlows } from "@/server/research/stablecoin-flows";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { namespace: "stablecoin-flows", limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  if (Number(request.headers.get("content-length") ?? 0) > STABLECOIN_FLOW_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", message: `Requests are limited to ${STABLECOIN_FLOW_LIMITS.maxRequestBytes} bytes.` },
      { status: 413, headers },
    );
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "The request body is not JSON." }, { status: 400, headers });
  }

  try {
    const result = await trackStablecoinFlows(input);
    return NextResponse.json(result, { status: result.state === "unavailable" ? 503 : 200, headers });
  } catch (error) {
    if (error instanceof StablecoinFlowError) {
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: 400, headers });
    }
    return NextResponse.json(
      { error: "flow_read_failed", message: "The recorded mint and burn evidence could not be read." },
      { status: 500, headers },
    );
  }
}
