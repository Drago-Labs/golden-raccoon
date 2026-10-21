/**
 * Unifies npm and crates.io release metadata into one bounded, newest-first
 * shape the rest of this feature operates on, so `provenance.ts`,
 * `maintainerDiff.ts`, and `installScripts.ts` never need to know which
 * registry a release came from.
 */
import type { NpmPackageMetadata } from "./npmRegistry";
import type { CratesPackageMetadata } from "./cratesRegistry";
import { PACKAGE_PROVENANCE_LIMITS } from "./limits";

export type UnifiedRelease = {
  version: string;
  publishedAt: string | null;
  /** `null` when the registry does not expose a per-release maintainer snapshot. */
  maintainers: string[] | null;
  /** `null` when the registry does not expose lifecycle script metadata. */
  lifecycleScripts: string[] | null;
  npmHasAttestations: boolean;
  cratesTrustedPublishing: { provider: string; repository: string; runId: string; sha: string } | null;
};

/** Newest first, bounded to `PACKAGE_PROVENANCE_LIMITS.maxReleasesInspected`. */
export function buildReleaseHistoryFromNpm(meta: NpmPackageMetadata): { all: number; inspected: UnifiedRelease[] } {
  const inspected = meta.versions.slice(0, PACKAGE_PROVENANCE_LIMITS.maxReleasesInspected).map(
    (version) =>
      ({
        version: version.version,
        publishedAt: version.publishedAt,
        maintainers: version.maintainers,
        lifecycleScripts: version.scripts,
        npmHasAttestations: version.hasAttestations,
        cratesTrustedPublishing: null,
      }) satisfies UnifiedRelease,
  );
  return { all: meta.versions.length, inspected };
}

export function buildReleaseHistoryFromCrates(meta: CratesPackageMetadata): { all: number; inspected: UnifiedRelease[] } {
  const inspected = meta.versions.slice(0, PACKAGE_PROVENANCE_LIMITS.maxReleasesInspected).map(
    (version) =>
      ({
        version: version.version,
        publishedAt: version.publishedAt,
        maintainers: null,
        lifecycleScripts: null,
        npmHasAttestations: false,
        cratesTrustedPublishing: version.trustedPublishing,
      }) satisfies UnifiedRelease,
  );
  return { all: meta.versions.length, inspected };
}
