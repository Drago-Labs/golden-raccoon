import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import {
  VESTING_LIMITS,
  VestingUnlockError,
  analyseVestingUnlocks,
  createProductionReader,
} from "@/server/research/vesting-unlock";

/**
 * Read-only vesting / unlock workbench.
 *
 * Normalizes supported contract states and issuer-published schedules into
 * dated tranches. Nothing is claimed, scheduled, or submitted.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "vesting-unlock", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > VESTING_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: VESTING_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  try {
    const report = await analyseVestingUnlocks(body, createProductionReader());

    return NextResponse.json(
      { report },
      {
        status: report.coverage.state === "unavailable" ? 503 : 200,
        headers:
          report.coverage.state === "unavailable"
            ? { ...noStore, "Retry-After": "15" }
            : noStore,
      },
    );
  } catch (error) {
    if (error instanceof VestingUnlockError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: noStore },
      );
    }

    return NextResponse.json({ error: "vesting_unlock_failed" }, { status: 500, headers: noStore });
  }
}
