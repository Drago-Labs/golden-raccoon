import { NextResponse } from "next/server";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { evaluateReadinessGates } from "../../../../server/operations/gates";

function getCommitSha(): string {
  if (process.env.GIT_COMMIT) {
    return process.env.GIT_COMMIT;
  }
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function getRootDir(): string {
  const cur = process.cwd();
  if (existsSync(join(cur, "scripts", "release-gate.mjs"))) {
    return cur;
  }
  const parent = resolve(cur, "..");
  if (existsSync(join(parent, "scripts", "release-gate.mjs"))) {
    return parent;
  }
  return cur;
}

/**
 * Endpoint returning aggregate machine-checkable release readiness verdict and gate breakdowns.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const environment = searchParams.get("env") || process.env.APP_MODE || "production";
  const commit = getCommitSha();
  const rootDir = getRootDir();

  const report = await evaluateReadinessGates({
    commit,
    environment,
    rootDir,
  });

  return NextResponse.json(report, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
