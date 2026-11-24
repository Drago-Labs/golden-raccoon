import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import {
  DELEGATE_LIMITS,
  DelegateParticipationError,
  readDelegateParticipation,
} from "@/server/research/delegate-participation";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { namespace: "delegate-participation", limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  if (Number(request.headers.get("content-length") ?? 0) > DELEGATE_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", message: `Requests are limited to ${DELEGATE_LIMITS.maxRequestBytes} bytes.` },
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
    const result = await readDelegateParticipation(input);
    // An unsupported governor is a typed state, not a provider failure: the
    // request was understood, the governor just does not emit what is read.
    const status = result.state === "unsupported_governor" ? 422 : result.state === "unavailable" ? 503 : 200;
    return NextResponse.json(result, { status, headers });
  } catch (error) {
    if (error instanceof DelegateParticipationError) {
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: 400, headers });
    }
    return NextResponse.json(
      { error: "participation_read_failed", message: "The governance evidence could not be read." },
      { status: 500, headers },
    );
  }
}
