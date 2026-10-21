import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { fetchCratesPackage } from "@/server/research/package-provenance/cratesRegistry";
import { PackageProvenanceError } from "@/server/research/package-provenance/errors";
import { PACKAGE_PROVENANCE_LIMITS } from "@/server/research/package-provenance/limits";
import { fetchNpmAttestationBundle, fetchNpmPackage } from "@/server/research/package-provenance/npmRegistry";
import { inspectPackageProvenance } from "@/server/research/package-provenance/service";
import { fetchGithubTags } from "@/server/research/package-provenance/tagMatching";

/**
 * Read-only package provenance inspection.
 *
 * Reads npm or crates.io registry metadata and the declared repository's
 * tags under published bounds. Writes nothing and offers no supply-chain
 * safety verdict.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "package-provenance", limit: 20, windowMs: 60_000 });
  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > PACKAGE_PROVENANCE_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: PACKAGE_PROVENANCE_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > PACKAGE_PROVENANCE_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: PACKAGE_PROVENANCE_LIMITS.maxRequestBytes }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const report = await inspectPackageProvenance(body, {
      fetchNpmPackage,
      fetchNpmAttestationBundle,
      fetchCratesPackage,
      fetchGithubTags,
    });
    return NextResponse.json({ report }, { headers: noStore });
  } catch (error) {
    if (error instanceof PackageProvenanceError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.code === "payload_too_large" ? 413 : 400, headers: noStore },
      );
    }
    return NextResponse.json({ error: "package_provenance_inspection_failed" }, { status: 500, headers: noStore });
  }
}
