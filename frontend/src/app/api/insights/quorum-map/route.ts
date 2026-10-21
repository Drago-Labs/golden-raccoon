import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { QUORUM_LIMITS, QuorumMapError, mapQuorum } from "@/server/research/quorum-map";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

/** Read-only quorum dependence. The handler does not claim the network is safe. */
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "quorum-map", limit: 20, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > QUORUM_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: QUORUM_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  try {
    const report = await mapQuorum(body);
    return NextResponse.json(
      { report },
      {
        status: report.state === "unavailable" ? 503 : 200,
        headers: report.state === "unavailable" ? { ...noStore, "Retry-After": "15" } : noStore,
      },
    );
  } catch (error) {
    if (error instanceof QuorumMapError) {
      const status = error.code === "response_too_large" ? 413 : 400;
      return NextResponse.json({ error: error.code, message: error.message }, { status, headers: noStore });
    }
    return NextResponse.json({ error: "quorum_map_failed" }, { status: 500, headers: noStore });
  }
}
