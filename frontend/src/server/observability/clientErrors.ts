/**
 * Structured, redacted reports for errors that reached a route boundary
 * (issue #134).
 *
 * A crash report is only useful if it can be read by whoever is on call, and
 * only safe if it carries nothing that identifies a user or lets someone act as
 * them. The two pull against each other, so the shape here is an **allowlist**:
 * a report is rebuilt field by field from a fixed set, and anything the client
 * sent that is not on that list is dropped rather than sanitised. A blocklist
 * would need to anticipate every field a future caller might add.
 *
 * Each surviving string is then redacted, because the allowed fields can still
 * carry an address — `/snapshots/GABC…` is a route.
 */

import { redactApiKeys, redactStellarSecretKey } from "@/server/observability/executionRedaction";
import { redactReportText } from "@/lib/errors/redactReport";

import type { ErrorCategory } from "@/lib/errors/boundaryCategory";

export type ClientErrorReport = {
  /** Route the boundary was mounted on, with identifiers removed. */
  route: string;
  category: ErrorCategory;
  /** Next.js error digest — a hash, safe to keep and the key to server logs. */
  digest?: string;
  /** Error constructor name, never the message. */
  name?: string;
  occurredAt: string;
};

export type ClientErrorReportResult =
  | { ok: true; report: ClientErrorReport }
  | { ok: false; code: "malformed" | "unknown_category" };

const VALID_CATEGORIES = new Set<string>([
  "provider_outage",
  "not_found",
  "wallet",
  "rate_limited",
  "client_bug",
]);

/**
 * Redacts on arrival as well as at the source.
 *
 * The browser already applies `redactReportText` before sending, but this
 * endpoint accepts input from anything that can post to it, so the same rules
 * are applied again here and the server's own secret and API-key redaction is
 * layered on top.
 */
export function redactClientErrorText(input: string): string {
  const shared = redactReportText(input);
  return redactApiKeys(redactStellarSecretKey(shared));
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Rebuilds a report from untrusted client input.
 *
 * Returns a new object containing only known fields, so a client that adds
 * `walletAddress` or `balances` to the payload cannot get them stored.
 */
export function sanitizeClientErrorReport(input: unknown): ClientErrorReportResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, code: "malformed" };
  }

  const raw = input as Record<string, unknown>;

  const route = readString(raw.route);
  if (!route) {
    return { ok: false, code: "malformed" };
  }

  const category = readString(raw.category);
  if (!category || !VALID_CATEGORIES.has(category)) {
    return { ok: false, code: "unknown_category" };
  }

  const digest = readString(raw.digest);
  const name = readString(raw.name);

  const report: ClientErrorReport = {
    route: redactClientErrorText(route),
    category: category as ErrorCategory,
    occurredAt: new Date().toISOString(),
  };

  if (digest) {
    report.digest = redactClientErrorText(digest);
  }

  if (name) {
    report.name = redactClientErrorText(name);
  }

  return { ok: true, report };
}

/** Fields a report is allowed to contain, for tests and tooling. */
export const CLIENT_ERROR_REPORT_FIELDS: readonly string[] = [
  "route",
  "category",
  "digest",
  "name",
  "occurredAt",
];
