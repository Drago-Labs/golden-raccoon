import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { GovernanceError, assertGovernorAddress, summarizeGovernance, type GovernorInput } from "@/server/research/governance-concentration/service";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "governance-concentration", limit: 20, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  const governor = typeof (body as { governor?: unknown })?.governor === "string" ? (body as { governor: string }).governor : "";
  try {
    assertGovernorAddress(governor);
    const fixture = (body as { fixture?: GovernorInput }).fixture;
    if (!fixture) {
      return NextResponse.json({ status: "unavailable", proposals: [], coverage: "No pinned governor fixture was supplied." }, { headers: noStore });
    }
    return NextResponse.json(summarizeGovernance({ ...fixture, governor }), { headers: noStore });
  } catch (error) {
    if (error instanceof GovernanceError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "governance_failed" }, { status: 500, headers: noStore });
  }
}
