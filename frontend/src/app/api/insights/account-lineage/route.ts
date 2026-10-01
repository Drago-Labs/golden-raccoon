import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { AccountLineageError, assertAccount, traceLineage, type LineageInput } from "@/server/research/account-lineage/service";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "account-lineage", limit: 20, windowMs: 60_000 });
  if (rateLimited) return rateLimited;
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }
  const account = typeof (body as { account?: unknown })?.account === "string" ? (body as { account: string }).account : "";
  try {
    assertAccount(account);
    const fixture = (body as { fixture?: LineageInput }).fixture;
    if (!fixture) {
      return NextResponse.json({ status: "unavailable", hops: [], coverage: "No account fixture was supplied." }, { headers: noStore });
    }
    return NextResponse.json(traceLineage({ ...fixture, account }), { headers: noStore });
  } catch (error) {
    if (error instanceof AccountLineageError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "lineage_failed" }, { status: 500, headers: noStore });
  }
}
