import { NextResponse } from "next/server";
import { resolve } from "node:path";
import { evaluateReadinessVerdict } from "@/server/operations/gates/verdict";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const environment = searchParams.get("env") || process.env.APP_MODE || "production";
  const commitSha =
    searchParams.get("commit") ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    "head";

  const rootDir = resolve(process.cwd(), "..");

  const verdict = await evaluateReadinessVerdict({
    commitSha,
    environment,
    rootDir,
  });

  const statusCode = verdict.verdict === "ready" ? 200 : 503;

  return NextResponse.json(verdict, {
    status: statusCode,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Readiness-Verdict": verdict.verdict,
    },
  });
}
