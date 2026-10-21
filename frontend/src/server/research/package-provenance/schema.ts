/**
 * Versioned contract for the package provenance inspector.
 *
 * The line this feature refuses to cross: **a missing attestation is a gap
 * in evidence, not proof of compromise.** This tool reports what the
 * registry and declared repository show about a release — build
 * provenance, maintainer changes, lifecycle scripts, tag history — and
 * never decides whether a package is safe to install. `supplyChainVerdict`
 * is hard-coded to `null` so no code path can turn evidence into a verdict.
 */
import { z } from "zod";

export const PACKAGE_PROVENANCE_SCHEMA_VERSION = "package-provenance/2026-01" as const;

export type PackageRegistryName = "npm" | "crates";

export type ProvenanceVerdict = "verified" | "unverified" | "unavailable";

export type ReleaseProvenance = {
  verdict: ProvenanceVerdict;
  sourceRepository: string | null;
  workflowPath: string | null;
  commit: string | null;
  buildRunUrl: string | null;
  notes: string[];
};

export type TagMatchState = "matched" | "no_matching_tag" | "unknown";

export type TagMatch = {
  state: TagMatchState;
  expectedTag: string | null;
  note: string;
};

export type ReleaseRecord = {
  version: string;
  publishedAt: string | null;
  /** `null` when this registry does not expose a per-release maintainer snapshot. */
  maintainers: string[] | null;
  /** `null` when this registry does not expose lifecycle script metadata. */
  lifecycleScripts: string[] | null;
  provenance: ReleaseProvenance;
  tagMatch: TagMatch;
};

export type MaintainerChange = {
  fromVersion: string;
  toVersion: string;
  added: string[];
  removed: string[];
};

export type InstallScriptChange = {
  version: string;
  newScripts: string[];
};

export type CoverageState = "complete" | "partial" | "empty" | "unavailable";

export type PackageProvenanceReport = {
  schemaVersion: typeof PACKAGE_PROVENANCE_SCHEMA_VERSION;
  evaluatedAt: string;
  registry: PackageRegistryName;
  packageName: string;
  declaredRepository: string | null;
  releasesInspected: number;
  releasesAvailable: number;
  releases: ReleaseRecord[];
  maintainerChanges: MaintainerChange[];
  installScriptChanges: InstallScriptChange[];
  coverage: { state: CoverageState; note: string };
  /** Hard-coded so no code path can turn evidence into a safety judgment. */
  supplyChainVerdict: null;
  readOnly: true;
};

export const packageProvenanceRequestSchema = z.object({
  registry: z.enum(["npm", "crates"]),
  packageName: z.string().min(1).max(214),
  evaluatedAt: z.string().datetime().optional(),
});

export type PackageProvenanceRequest = z.infer<typeof packageProvenanceRequestSchema>;
