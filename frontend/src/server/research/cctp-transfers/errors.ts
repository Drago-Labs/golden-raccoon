/**
 * Typed error for the CCTP transfer tracker — see
 * `frontend/src/server/research/policy-changes/errors.ts` for the
 * established sibling pattern this mirrors.
 */
export class CctpTransferError extends Error {
  constructor(
    readonly code: "invalid_request" | "unknown_source_chain" | "payload_too_large",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CctpTransferError";
  }
}
