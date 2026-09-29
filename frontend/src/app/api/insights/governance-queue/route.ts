import { NextResponse } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { governanceQueueRequestSchema, inspectGovernanceQueue } from "@/server/research/governance-queue";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, { namespace: "governance-queue:read", limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = governanceQueueRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  const result = await inspectGovernanceQueue();
  if (parsed.data.network !== (result.network ?? parsed.data.network) && result.network) {
    return NextResponse.json({ error: "network_mismatch", state: "malformed", warnings: ["Requested network does not match configured governance network"], items: [], readiness: [], scoreUnchanged: true }, { status: 400 });
  }
  const status = result.state === "provider_error" || result.state === "malformed" ? 502 : result.state === "uninitialized" ? 503 : 200;
  return NextResponse.json(result, { status });
}
