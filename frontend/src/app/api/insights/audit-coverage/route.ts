import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { AuditCoverageError, assertContract, mapAudits, type AuditRecord, type DeployedContract } from "@/server/research/audit-coverage/service";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "audit-coverage", limit: 20, windowMs: 60_000 });
  if (rateLimited) return rateLimited;
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }
  const contract = typeof (body as { contract?: unknown })?.contract === "string" ? (body as { contract: string }).contract : "";
  try {
    assertContract(contract);
    const fixture = (body as { fixture?: { records: AuditRecord[]; deployed: DeployedContract[] } }).fixture;
    if (!fixture) {
      return NextResponse.json({ status: "unavailable", contracts: [], coverage: "No audit fixture was supplied." }, { headers: noStore });
    }
    return NextResponse.json(mapAudits(fixture.records, fixture.deployed), { headers: noStore });
  } catch (error) {
    if (error instanceof AuditCoverageError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "audit_coverage_failed" }, { status: 500, headers: noStore });
  }
}
