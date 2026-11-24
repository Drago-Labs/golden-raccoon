import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import {
  SEP41_CONFORMANCE_LIMITS,
  Sep41ConformanceError,
  inspectSep41Conformance,
} from "@/server/research/sep41-conformance";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

/** Read-only SEP-41 conformance report. Never writes or sends authenticated requests. */
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, {
    namespace: "sep41-conformance",
    limit: 12,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > SEP41_CONFORMANCE_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", limitBytes: SEP41_CONFORMANCE_LIMITS.maxRequestBytes },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  try {
    const report = await inspectSep41Conformance(body);
    return NextResponse.json(
      { report },
      {
        status: report.state === "unavailable" ? 503 : 200,
        headers: report.state === "unavailable" ? { ...noStore, "Retry-After": "15" } : noStore,
      },
    );
  } catch (error) {
    if (error instanceof Sep41ConformanceError) {
      const status =
        error.kind === "invalid_contract" || error.kind === "invalid_request"
          ? 400
          : error.kind === "response_too_large"
            ? 413
            : 400;
      return NextResponse.json({ error: error.kind, message: error.message }, { status, headers: noStore });
    }
    return NextResponse.json({ error: "sep41_conformance_failed" }, { status: 500, headers: noStore });
  }
}
