/**
 * Receives redacted boundary error reports from the browser (issue #134).
 *
 * The payload is rebuilt from an allowlist before it is logged, so a client —
 * or anything that can post as one — cannot get a wallet address, a balance, or
 * a credential into the logs by adding fields to the body.
 */

import { NextResponse } from "next/server";

import { sanitizeClientErrorReport } from "@/server/observability/clientErrors";

export const dynamic = "force-dynamic";

/** Bodies larger than this are refused unread; a report is a handful of fields. */
const MAX_BODY_BYTES = 4_096;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ accepted: false, code: "payload_too_large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ accepted: false, code: "malformed" }, { status: 400 });
  }

  const sanitized = sanitizeClientErrorReport(body);
  if (!sanitized.ok) {
    return NextResponse.json({ accepted: false, code: sanitized.code }, { status: 400 });
  }

  // Only the rebuilt report is logged — never the original body.
  console.error(
    JSON.stringify({
      event: "client_error_boundary",
      ...sanitized.report,
    }),
  );

  return NextResponse.json({ accepted: true }, { status: 202 });
}
