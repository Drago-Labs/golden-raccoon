import { NextResponse, type NextRequest } from "next/server";
import { PRIVILEGED_KEY_LIMITS, buildPrivilegedKeyInventory } from "@/server/research/privileged-keys";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" } as const;

/** Read-only. The body is a recorded registry payload or a provider-unavailable marker. */
export async function POST(request: NextRequest) {
  const text = await request.text();
  if (text.length > PRIVILEGED_KEY_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413, headers: noStore });
  }
  try {
    JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }
  const result = buildPrivilegedKeyInventory(JSON.parse(text));
  return NextResponse.json(result, { headers: noStore });
}
