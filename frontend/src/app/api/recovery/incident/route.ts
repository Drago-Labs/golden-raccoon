import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { assertApprovalOnly } from "@/server/security/policy";
import { getIncidentMode, setIncidentMode } from "@/server/recovery";

const bodySchema = z.object({
  enabled: z.boolean(),
  reason: z.string().min(1).max(280).optional(),
  adminToken: z.string().min(8),
  updatedBy: z.string().min(1).max(64).optional(),
});

function assertAdminAuthorized(token?: string) {
  const expected = process.env.RECOVERY_ADMIN_TOKEN;

  if (!expected) {
    throw new Error("Incident mode toggle is disabled. Set RECOVERY_ADMIN_TOKEN to enable admin recovery endpoints.");
  }

  if (!token || token !== expected) {
    throw new Error("Admin token is required to toggle incident mode.");
  }
}

export async function GET() {
  return withCacheHeaders(NextResponse.json({ incidentMode: getIncidentMode() }), "recovery");
}

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "recovery:incident", limit: 6, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    assertAdminAuthorized(parsed.data.adminToken);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Admin authorization failed" }, { status: 401 });
  }

  try {
    assertApprovalOnly({ autoExecute: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recovery policy failed" }, { status: 403 });
  }

  const record = setIncidentMode(parsed.data.enabled, { reason: parsed.data.reason, updatedBy: parsed.data.updatedBy });

  return withCacheHeaders(NextResponse.json({ incidentMode: record }), "recovery");
}
