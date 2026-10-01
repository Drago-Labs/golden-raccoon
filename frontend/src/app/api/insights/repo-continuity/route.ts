import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { RepoContinuityError, assertRepoName, measureRepositories, type RepoInput } from "@/server/research/repo-continuity/service";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "repo-continuity", limit: 20, windowMs: 60_000 });
  if (rateLimited) return rateLimited;
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }
  const repo = typeof (body as { repo?: unknown })?.repo === "string" ? (body as { repo: string }).repo : "";
  try {
    assertRepoName(repo);
    const fixture = (body as { fixture?: RepoInput }).fixture;
    if (!fixture) {
      return NextResponse.json({ status: "unavailable", rows: [], coverage: "No repository fixture was supplied." }, { headers: noStore });
    }
    const report = measureRepositories(fixture);
    return NextResponse.json(report, { headers: noStore });
  } catch (error) {
    if (error instanceof RepoContinuityError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "repo_continuity_failed" }, { status: 500, headers: noStore });
  }
}
