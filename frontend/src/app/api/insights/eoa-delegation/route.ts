import { NextResponse } from "next/server";
import { delegationRequestSchema, inspectEoaDelegation } from "@/server/research/eoa-delegation";
import { checkRateLimit } from "@/server/security/rateLimit";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { const limited = checkRateLimit(request, { namespace: "eoa-delegation:read", limit: 20, windowMs: 60_000 }); if (limited) return limited; const parsed = delegationRequestSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 }); const result = await inspectEoaDelegation(parsed.data); return NextResponse.json(result, { status: result.state === "unavailable" ? 503 : 200, headers: { "cache-control": "no-store" } }); }
