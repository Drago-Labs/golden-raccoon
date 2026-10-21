import { NextResponse, type NextRequest } from "next/server";
import { compareRpcConsistency, CONSISTENCY_LIMITS, isRpcConsistencyError } from "@/server/research/rpc-consistency";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Read-only comparison of Horizon and Stellar RPC for one target.
 *
 * The route does not cache, does not write, and does not fall back from
 * testnet to mainnet. Provider failures become a report; a malformed request
 * is rejected.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "rpc-consistency", limit: 20, windowMs: 60_000 });

  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > CONSISTENCY_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", limitBytes: CONSISTENCY_LIMITS.maxRequestBytes },
      { status: 413, headers: noStore },
    );
  }

  let text: string;

  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  if (text.length > CONSISTENCY_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", limitBytes: CONSISTENCY_LIMITS.maxRequestBytes },
      { status: 413, headers: noStore },
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  try {
    const report = await compareRpcConsistency(body);

    return NextResponse.json({ report }, { headers: noStore });
  } catch (error) {
    if (isRpcConsistencyError(error)) {
      const status = error.code === "payload_too_large" ? 413 : 400;

      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details ?? null },
        { status, headers: noStore },
      );
    }

    return NextResponse.json({ error: "rpc_consistency_failed" }, { status: 500, headers: noStore });
  }
}
