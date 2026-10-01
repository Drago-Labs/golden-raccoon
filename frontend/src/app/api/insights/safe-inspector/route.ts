import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { SafeInspectorError, inspectSafe, type SafeEvent } from "@/server/research/safe-inspector/service";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "safe-inspector", limit: 20, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: noStore });
  }
  const record = body as Parameters<typeof inspectSafe>[0] & { events?: SafeEvent[] };
  try {
    return NextResponse.json({ report: inspectSafe(record) }, { headers: noStore });
  } catch (error) {
    if (error instanceof SafeInspectorError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "safe_inspector_failed" }, { status: 500, headers: noStore });
  }
}
