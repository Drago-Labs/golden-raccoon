import { NextResponse, type NextRequest } from "next/server";
import { TREASURY_LIMITS, analyseTreasury } from "@/server/research/treasury-flows";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" } as const;
export async function POST(request: NextRequest) {
  const text = await request.text();
  if (text.length > TREASURY_LIMITS.maxRequestBytes) return NextResponse.json({ error: "payload_too_large" }, { status: 413, headers: noStore });
  try { JSON.parse(text); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore }); }
  return NextResponse.json(analyseTreasury(JSON.parse(text)), { headers: noStore });
}
