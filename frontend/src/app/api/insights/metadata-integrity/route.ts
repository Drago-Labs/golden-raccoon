import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import {
  METADATA_LIMITS,
  MetadataIntegrityError,
} from "@/server/research/metadata-integrity/schema";
import { createProductionIssuerReader } from "@/server/research/metadata-integrity/issuerReader";
import { createProductionTomlFetcher } from "@/server/research/metadata-integrity/tomlFetch";
import { inspectMetadataIntegrity } from "@/server/research/metadata-integrity/service";

/**
 * Read-only metadata integrity inspection.
 *
 * Fetches issuer home-domain evidence and SEP-1 TOML under published bounds.
 * Writes nothing, scores no risk, and never produces a legitimacy verdict.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "metadata-integrity", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > METADATA_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", limitBytes: METADATA_LIMITS.maxRequestBytes },
      { status: 413 },
    );
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > METADATA_LIMITS.maxRequestBytes) {
      return NextResponse.json(
        { error: "payload_too_large", limitBytes: METADATA_LIMITS.maxRequestBytes },
        { status: 413 },
      );
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const report = await inspectMetadataIntegrity(body, {
      readIssuer: createProductionIssuerReader(),
      fetchToml: createProductionTomlFetcher(),
    });

    return NextResponse.json({ report }, { headers: noStore });
  } catch (error) {
    if (error instanceof MetadataIntegrityError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.code === "payload_too_large" ? 413 : 400, headers: noStore },
      );
    }

    return NextResponse.json({ error: "metadata_integrity_failed" }, { status: 500, headers: noStore });
  }
}
