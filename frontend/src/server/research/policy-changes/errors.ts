/**
 * Typed error and state union for the policy-change tracker.
 *
 * `errors.ts` holds the typed error and state union, as the feature-local
 * convention requires — see `frontend/src/server/research/metadata-integrity/schema.ts`
 * for the established sibling pattern this mirrors.
 */
export class PolicyChangeError extends Error {
  constructor(
    readonly code: "invalid_request" | "unknown_project" | "payload_too_large",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PolicyChangeError";
  }
}

export type PageFetchOutcome =
  | "ok"
  | "redirect_blocked"
  | "private_or_local_target"
  | "oversized"
  | "timeout"
  | "http_error"
  | "dns_failure"
  | "unsupported_content_type";
