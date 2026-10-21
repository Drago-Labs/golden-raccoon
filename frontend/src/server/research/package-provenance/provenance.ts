/**
 * Pure classification of a release's build provenance.
 *
 * This module never fetches anything — `npmRegistry.ts` already fetched
 * the attestation bundle, `cratesRegistry.ts` already read `trustpub_data`
 * from the crate response — so these functions are deterministic and
 * testable against fixtures without a network.
 */
import type { NpmAttestationResult } from "./npmRegistry";
import type { UnifiedRelease } from "./releaseHistory";
import type { ReleaseProvenance } from "./schema";

export function classifyNpmProvenance(attestation: NpmAttestationResult): ReleaseProvenance {
  if (attestation.outcome === "none") {
    return {
      verdict: "unverified",
      sourceRepository: null,
      workflowPath: null,
      commit: null,
      buildRunUrl: null,
      notes: ["No build provenance attestation was present for this release."],
    };
  }

  if (attestation.outcome === "unavailable") {
    return {
      verdict: "unavailable",
      sourceRepository: null,
      workflowPath: null,
      commit: null,
      buildRunUrl: null,
      notes: attestation.issues,
    };
  }

  return {
    verdict: "verified",
    sourceRepository: attestation.sourceRepository,
    workflowPath: attestation.workflowPath,
    commit: attestation.commit,
    buildRunUrl: attestation.buildRunUrl,
    notes: ["Build provenance attestation present and parsed from the npm registry."],
  };
}

export function classifyNpmProvenanceSkipped(): ReleaseProvenance {
  return {
    verdict: "unavailable",
    sourceRepository: null,
    workflowPath: null,
    commit: null,
    buildRunUrl: null,
    notes: ["This release is beyond the attestation-check budget for this request and was not inspected."],
  };
}

export function classifyCratesProvenance(release: UnifiedRelease): ReleaseProvenance {
  const trustedPublishing = release.cratesTrustedPublishing;
  if (!trustedPublishing) {
    return {
      verdict: "unverified",
      sourceRepository: null,
      workflowPath: null,
      commit: null,
      buildRunUrl: null,
      notes: ["This release has no Trusted Publishing provenance data from crates.io."],
    };
  }

  return {
    verdict: "verified",
    sourceRepository: `https://github.com/${trustedPublishing.repository}`,
    workflowPath: null,
    commit: trustedPublishing.sha,
    buildRunUrl: trustedPublishing.runId ? `https://github.com/${trustedPublishing.repository}/actions/runs/${trustedPublishing.runId}` : null,
    notes: [`Published via crates.io Trusted Publishing (${trustedPublishing.provider}) from GitHub Actions.`],
  };
}
