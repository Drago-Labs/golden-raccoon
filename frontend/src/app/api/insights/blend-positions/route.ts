import { NextResponse } from "next/server";
import {
  BLEND_POSITION_LIMITS,
  BlendPositionError,
  blendPositionRequestSchema,
  explainBlendPositions,
} from "@/server/research/blend-positions";
import { checkRateLimit } from "@/server/security/rateLimit";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, {
    namespace: "blend-positions:read",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > BLEND_POSITION_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413, headers: noStore });
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  const parsed = blendPositionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400, headers: noStore },
    );
  }

  try {
    const report = await explainBlendPositions(parsed.data);
    return NextResponse.json(
      { report },
      { status: report.state === "unavailable" ? 503 : 200, headers: noStore },
    );
  } catch (err) {
    if (err instanceof BlendPositionError) {
      return NextResponse.json({ error: err.kind, message: err.message }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "blend_positions_failed" }, { status: 500, headers: noStore });
  }
}
