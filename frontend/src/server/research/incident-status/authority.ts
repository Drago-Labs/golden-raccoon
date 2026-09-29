/**
 * Authority and status rules.
 *
 * An unverified rumor cannot become an official acknowledgement. Only
 * official_advisory and project_statement with authority `official` may claim
 * `acknowledged` or `mitigated`. Everything else that asserts those statuses is
 * kept as `reported` with an explicit reason.
 */
import type { Authority, ClaimedStatus, DocumentKind } from "./schema";

const OFFICIAL_KINDS = new Set<DocumentKind>(["official_advisory", "project_statement", "remediation_update"]);

const OFFICIAL_ONLY_STATUSES = new Set<ClaimedStatus>(["acknowledged", "mitigated"]);

export function resolveAuthority(kind: DocumentKind, declared?: Authority): Authority {
  if (declared) return declared;
  if (kind === "rumor") return "unofficial";
  if (OFFICIAL_KINDS.has(kind)) return "official";
  if (kind === "news_report") return "unofficial";
  return "unknown";
}

export function resolveEffectiveStatus(
  claimedStatus: ClaimedStatus,
  authority: Authority,
  kind: DocumentKind,
): { effectiveStatus: ClaimedStatus; statusReason: string } {
  if (!OFFICIAL_ONLY_STATUSES.has(claimedStatus)) {
    return {
      effectiveStatus: claimedStatus,
      statusReason: `Source claims ${claimedStatus}; no authority upgrade applied.`,
    };
  }

  const mayAssertOfficial = authority === "official" && OFFICIAL_KINDS.has(kind);

  if (mayAssertOfficial) {
    return {
      effectiveStatus: claimedStatus,
      statusReason: `Official ${kind.replaceAll("_", " ")} supports ${claimedStatus}.`,
    };
  }

  return {
    effectiveStatus: "reported",
    statusReason:
      "An unverified or unofficial source cannot become an official acknowledgement; the claim is kept as reported.",
  };
}

export function canSupportOfficialTransition(authority: Authority, kind: DocumentKind): boolean {
  return authority === "official" && OFFICIAL_KINDS.has(kind);
}
