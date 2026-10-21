import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { POLICY_CHANGE_LIMITS } from "@/server/research/policy-changes/limits";
import { PolicyChangeError } from "@/server/research/policy-changes/errors";
import { createProductionPageFetcher } from "@/server/research/policy-changes/fetcher";
import { trackPolicyChanges } from "@/server/research/policy-changes/service";

/**
 * Read-only policy-change tracking.
 *
 * Fetches a registry-listed project's policy page under published bounds.
 * Writes nothing, offers no legal opinion, and stores no history server-side.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "policy-changes", limit: 20, windowMs: 60_000 });
  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > POLICY_CHANGE_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: POLICY_CHANGE_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > POLICY_CHANGE_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: POLICY_CHANGE_LIMITS.maxRequestBytes }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const report = await trackPolicyChanges(body, { fetchPage: createProductionPageFetcher() });
    return NextResponse.json({ report }, { headers: noStore });
  } catch (error) {
    if (error instanceof PolicyChangeError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.code === "payload_too_large" ? 413 : 400, headers: noStore },
      );
    }
    return NextResponse.json({ error: "policy_change_tracking_failed" }, { status: 500, headers: noStore });
  }
}
