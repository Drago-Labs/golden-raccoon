/**
 * Typed error for the package provenance inspector — see
 * `frontend/src/server/research/policy-changes/errors.ts` for the
 * established sibling pattern this mirrors.
 */
export class PackageProvenanceError extends Error {
  constructor(
    readonly code: "invalid_request" | "invalid_package_name" | "payload_too_large",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PackageProvenanceError";
  }
}
