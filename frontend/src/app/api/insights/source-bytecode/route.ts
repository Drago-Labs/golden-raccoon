import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { SourceBytecodeError, compareVerifiedBytecode, type VerificationSource } from "@/server/research/source-bytecode/service";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "source-bytecode", limit: 20, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: noStore });
  }

  const record = body as {
    address?: unknown;
    blockNumber?: unknown;
    bytecode?: unknown;
    source?: VerificationSource | null;
    sourceFailed?: unknown;
  };

  try {
    const report = compareVerifiedBytecode({
      address: String(record.address ?? ""),
      blockNumber: Number(record.blockNumber),
      bytecode: typeof record.bytecode === "string" ? record.bytecode : null,
      source: record.source ?? null,
      sourceFailed: record.sourceFailed === true,
    });
    return NextResponse.json({ report }, { headers: noStore });
  } catch (error) {
    if (error instanceof SourceBytecodeError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "source_bytecode_failed" }, { status: 500, headers: noStore });
  }
}
