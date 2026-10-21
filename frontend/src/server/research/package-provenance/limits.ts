/** Pagination, timeout, and size bounds for the package provenance inspector. */
export const PACKAGE_PROVENANCE_LIMITS = {
  maxRequestBytes: 16_384,
  fetchTimeoutMs: 6_000,
  maxRedirects: 3,
  maxResponseBytes: 5_000_000,
  /** How many of the most recent releases get full inspection (tags, maintainer diff, scripts). */
  maxReleasesInspected: 15,
  /** How many of the most recently inspected npm releases also get an attestation-bundle fetch. */
  maxAttestationFetches: 5,
  maxTagsPerPage: 100,
  maxTagPages: 2,
  maxMaintainerChanges: 50,
  maxInstallScriptChanges: 50,
} as const;
