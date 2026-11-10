import { NextResponse } from "next/server";
import {
  decodeContractEvents,
  EVENT_DECODER_LIMITS,
  EventDecoderError,
  eventDecoderRequestSchema,
} from "@/server/research/event-decoder";
import { checkRateLimit } from "@/server/security/rateLimit";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, {
    namespace: "event-decoder:read",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > EVENT_DECODER_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413, headers: noStore });
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  const parsed = eventDecoderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400, headers: noStore },
    );
  }

  try {
    const report = await decodeContractEvents(parsed.data);
    return NextResponse.json(
      { report },
      { status: report.state === "unavailable" ? 503 : 200, headers: noStore },
    );
  } catch (err) {
    if (err instanceof EventDecoderError) {
      return NextResponse.json({ error: err.kind, message: err.message }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "event_decoder_failed" }, { status: 500, headers: noStore });
  }
}
