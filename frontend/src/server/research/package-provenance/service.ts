/**
 * Public entry point for the package provenance inspector.
 *
 * Reads a package's registry metadata and bounded release history,
 * verifies npm publish attestations or crates.io Trusted Publishing data,
 * diffs maintainers and lifecycle scripts across releases, and compares
 * release versions against tags in the declared repository. It never
 * installs anything, never scans for vulnerabilities, and never turns
 * evidence into a safety verdict.
 */
import type { CratesFetchResult } from "./cratesRegistry";
import { PackageProvenanceError } from "./errors";
import { detectNewLifecycleScripts } from "./installScripts";
import { diffMaintainers } from "./maintainerDiff";
import type { NpmAttestationResult, NpmFetchResult } from "./npmRegistry";
import { parsePackageIdentity } from "./packageIdentity";
import { classifyCratesProvenance, classifyNpmProvenance, classifyNpmProvenanceSkipped } from "./provenance";
import { buildReleaseHistoryFromCrates, buildReleaseHistoryFromNpm, type UnifiedRelease } from "./releaseHistory";
import { PACKAGE_PROVENANCE_LIMITS } from "./limits";
import {
  PACKAGE_PROVENANCE_SCHEMA_VERSION,
  packageProvenanceRequestSchema,
  type CoverageState,
  type PackageProvenanceReport,
  type ReleaseProvenance,
  type ReleaseRecord,
} from "./schema";
import type { GithubTagsResult } from "./tagMatching";
import { matchReleaseTags, parseGithubOwnerRepo } from "./tagMatching";

export type PackageProvenanceDeps = {
  fetchNpmPackage: (name: string) => Promise<NpmFetchResult>;
  fetchNpmAttestationBundle: (name: string, version: string) => Promise<NpmAttestationResult>;
  fetchCratesPackage: (name: string) => Promise<CratesFetchResult>;
  fetchGithubTags: (owner: string, repo: string) => Promise<GithubTagsResult>;
};

function emptyReport(registry: "npm" | "crates", packageName: string, evaluatedAt: string, coverage: { state: CoverageState; note: string }): PackageProvenanceReport {
  return {
    schemaVersion: PACKAGE_PROVENANCE_SCHEMA_VERSION,
    evaluatedAt,
    registry,
    packageName,
    declaredRepository: null,
    releasesInspected: 0,
    releasesAvailable: 0,
    releases: [],
    maintainerChanges: [],
    installScriptChanges: [],
    coverage,
    supplyChainVerdict: null,
    readOnly: true,
  };
}

export async function inspectPackageProvenance(input: unknown, deps: PackageProvenanceDeps): Promise<PackageProvenanceReport> {
  const parsed = packageProvenanceRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new PackageProvenanceError("invalid_request", "The package provenance request could not be read.", parsed.error.flatten());
  }

  const identity = parsePackageIdentity(parsed.data.registry, parsed.data.packageName);
  if (!identity) {
    throw new PackageProvenanceError("invalid_package_name", "That package name is not valid for the selected registry.");
  }

  const evaluatedAt = parsed.data.evaluatedAt ? new Date(Date.parse(parsed.data.evaluatedAt)).toISOString() : new Date().toISOString();

  let declaredRepository: string | null = null;
  let releasesAvailable = 0;
  let inspected: UnifiedRelease[] = [];

  if (identity.registry === "npm") {
    const fetched = await deps.fetchNpmPackage(identity.name);
    if (fetched.outcome !== "ok") {
      return emptyReport("npm", identity.name, evaluatedAt, {
        state: "unavailable",
        note: `The npm registry could not be read: ${fetched.issues.join("; ").replace(/\.$/, "")}.`,
      });
    }
    declaredRepository = fetched.packageMeta.repository;
    const history = buildReleaseHistoryFromNpm(fetched.packageMeta);
    releasesAvailable = history.all;
    inspected = history.inspected;
  } else {
    const fetched = await deps.fetchCratesPackage(identity.name);
    if (fetched.outcome !== "ok") {
      return emptyReport("crates", identity.name, evaluatedAt, {
        state: "unavailable",
        note: `The crates.io registry could not be read: ${fetched.issues.join("; ").replace(/\.$/, "")}.`,
      });
    }
    declaredRepository = fetched.crateMeta.repository;
    const history = buildReleaseHistoryFromCrates(fetched.crateMeta);
    releasesAvailable = history.all;
    inspected = history.inspected;
  }

  if (inspected.length === 0) {
    return emptyReport(identity.registry, identity.name, evaluatedAt, {
      state: "empty",
      note: "The registry was reached but no published releases were found.",
    });
  }

  const oldestFirst = [...inspected].reverse();
  const maintainerChanges = diffMaintainers(oldestFirst);
  const installScriptChanges = detectNewLifecycleScripts(oldestFirst);

  const provenanceByVersion = new Map<string, ReleaseProvenance>();
  if (identity.registry === "npm") {
    const toCheck = inspected.slice(0, PACKAGE_PROVENANCE_LIMITS.maxAttestationFetches);
    const results = await Promise.all(
      toCheck.map((release) => deps.fetchNpmAttestationBundle(identity.name, release.version).then((attestation) => classifyNpmProvenance(attestation))),
    );
    toCheck.forEach((release, index) => provenanceByVersion.set(release.version, results[index]));
    inspected.slice(PACKAGE_PROVENANCE_LIMITS.maxAttestationFetches).forEach((release) => provenanceByVersion.set(release.version, classifyNpmProvenanceSkipped()));
  } else {
    inspected.forEach((release) => provenanceByVersion.set(release.version, classifyCratesProvenance(release)));
  }

  const ownerRepo = parseGithubOwnerRepo(declaredRepository);
  let tagsResult: GithubTagsResult | null = null;
  if (ownerRepo) {
    tagsResult = await deps.fetchGithubTags(ownerRepo.owner, ownerRepo.repo);
  }

  const releases: ReleaseRecord[] = inspected.map((release) => {
    const tagMatch =
      tagsResult === null
        ? {
            state: "unknown" as const,
            expectedTag: null,
            note: declaredRepository
              ? "The declared repository is not hosted on github.com, so tag history could not be checked."
              : "No repository was declared for this package, so tag history could not be checked.",
          }
        : tagsResult.outcome === "ok"
          ? matchReleaseTags(identity.name, release.version, tagsResult.tags)
          : { state: "unknown" as const, expectedTag: null, note: `Tag history could not be read from the declared repository: ${tagsResult.issues.join("; ")}.` };

    return {
      version: release.version,
      publishedAt: release.publishedAt,
      maintainers: release.maintainers,
      lifecycleScripts: release.lifecycleScripts,
      provenance: provenanceByVersion.get(release.version) ?? classifyNpmProvenanceSkipped(),
      tagMatch,
    } satisfies ReleaseRecord;
  });

  let coverageState: CoverageState = "complete";
  let coverageNote = "Registry metadata, provenance attestations, and declared-repository tags were all inspected.";

  if (!ownerRepo) {
    coverageState = "partial";
    coverageNote = declaredRepository
      ? "Registry metadata and provenance were inspected, but the declared repository is not on github.com, so tags could not be matched."
      : "Registry metadata and provenance were inspected, but this package declares no repository, so tags could not be matched.";
  } else if (tagsResult && tagsResult.outcome !== "ok") {
    coverageState = "partial";
    coverageNote = `Registry metadata and provenance were inspected, but the declared repository's tags could not be read: ${tagsResult.issues.join("; ")}.`;
  }

  return {
    schemaVersion: PACKAGE_PROVENANCE_SCHEMA_VERSION,
    evaluatedAt,
    registry: identity.registry,
    packageName: identity.name,
    declaredRepository,
    releasesInspected: inspected.length,
    releasesAvailable,
    releases,
    maintainerChanges,
    installScriptChanges,
    coverage: { state: coverageState, note: coverageNote },
    supplyChainVerdict: null,
    readOnly: true,
  };
}
