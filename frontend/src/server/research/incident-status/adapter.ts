/**
 * Adapt raw document inputs into inspectable DocumentRef values.
 */
import { canonicalizeUrl, outletIdFor, tokenize } from "./canonical";
import { resolveAuthority, resolveEffectiveStatus } from "./authority";
import { identityKeyFor, subjectsMatch } from "./identity";
import { IncidentError, type DocumentInput, type DocumentRef, type SubjectInput } from "./schema";

function sanitizeText(value: string | null | undefined, max = 4_000): string | null {
  if (!value) return null;
  return value.replace(/<[^>]*>/g, "").trim().slice(0, max) || null;
}

function isStale(
  publishedAt: string | null,
  updatedAt: string | null,
  observedAtMs: number,
  staleAfterSeconds: number,
): { stale: boolean; reason: string | null } {
  const stamp = updatedAt ?? publishedAt;
  if (!stamp) {
    return { stale: true, reason: "No publication or update time was provided, so freshness is unknown and treated as stale." };
  }

  const at = Date.parse(stamp);
  if (!Number.isFinite(at)) {
    return { stale: true, reason: "The timestamp could not be read." };
  }

  const ageSeconds = Math.floor((observedAtMs - at) / 1000);
  if (ageSeconds > staleAfterSeconds) {
    return {
      stale: true,
      reason: `Last update is ${ageSeconds}s old, beyond the ${staleAfterSeconds}s freshness window.`,
    };
  }

  return { stale: false, reason: null };
}

export function adaptDocument(
  input: DocumentInput,
  requestSubject: SubjectInput,
  observedAtMs: number,
  staleAfterSeconds: number,
): DocumentRef {
  if (input.subject && !subjectsMatch(input.subject, requestSubject)) {
    throw new IncidentError(
      "subject_mismatch",
      "A document subject does not match the request subject; same-name projects on different networks stay distinct.",
      {
        documentId: input.documentId,
        documentIdentity: identityKeyFor(input.subject),
        requestIdentity: identityKeyFor(requestSubject),
      },
    );
  }

  const authority = resolveAuthority(input.kind, input.authority);
  const { effectiveStatus, statusReason } = resolveEffectiveStatus(input.claimedStatus, authority, input.kind);
  const title = sanitizeText(input.title, 400) ?? "Untitled";
  const summary = sanitizeText(input.summary);
  const publishedAt = input.publishedAt ?? null;
  const updatedAt = input.updatedAt ?? null;
  const freshness = isStale(publishedAt, updatedAt, observedAtMs, staleAfterSeconds);
  const tokens = tokenize(`${title} ${summary ?? ""}`);

  return {
    documentId: input.documentId,
    originalId: input.originalId ?? null,
    kind: input.kind,
    authority,
    claimedStatus: input.claimedStatus,
    effectiveStatus,
    statusReason,
    title,
    summary,
    outletId: outletIdFor(input.domain, input.outletId),
    domain: input.domain.trim().toLowerCase().replace(/^www\./, ""),
    canonicalUrl: canonicalizeUrl(input.url),
    syndicatedFrom: input.syndicatedFrom?.trim().toLowerCase() || null,
    publishedAt,
    updatedAt,
    subjectIdentityKey: identityKeyFor(requestSubject),
    role: "independent",
    roleReason: "Pending provenance assignment.",
    tokenCount: tokens.length,
    stale: freshness.stale,
    staleReason: freshness.reason,
  };
}
