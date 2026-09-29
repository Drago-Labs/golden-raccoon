/**
 * Normalizes caller-supplied channel observations.
 *
 * Handles, display names and snapshot text are hostile input. Markup and
 * invisible characters are stripped. URLs are classified for safety but never
 * fetched. An observation that cannot take part in diffs is kept with an
 * `excludedReason` rather than dropped.
 */
import { assessRedirectChain, canonicalizeUrl, summarizeUrlSafety } from "./urlPolicy";
import {
  CONTINUITY_LIMITS,
  type ChannelObservation,
  type ContinuitySubject,
  type FetchOutcome,
  type ObservationInput,
} from "./schema";

const INVISIBLE_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

export function sanitizeText(value: string, maxLength = CONTINUITY_LIMITS.maxSnapshotLength): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(INVISIBLE_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeHandle(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return sanitizeText(value, 200).replace(/^@+/, "").toLowerCase() || null;
}

function resolveOutcome(
  input: ObservationInput,
  urlSafety: ReturnType<typeof summarizeUrlSafety>,
  redirect: ReturnType<typeof assessRedirectChain>,
): FetchOutcome {
  if (input.fetchOutcome === "blocked_unsafe" || !urlSafety.safe || !redirect.safe) {
    return "blocked_unsafe";
  }
  if (input.fetchOutcome) return input.fetchOutcome;
  if ((input.redirectChain?.length ?? 0) > 1) return "redirected";
  if (input.url) return "not_fetched";
  return "not_fetched";
}

export function adaptObservation(
  input: ObservationInput,
  subjectsById: Map<string, ContinuitySubject>,
): ChannelObservation {
  const subject = subjectsById.get(input.subjectId);
  const identityKey = subject?.identityKey ?? `unknown|${input.subjectId}`;
  const channelKey = (input.channelKey?.trim() || input.channelKind).toLowerCase();

  const url = canonicalizeUrl(input.url ?? null);
  const redirectChain = (input.redirectChain ?? [])
    .map((hop) => canonicalizeUrl(hop) ?? hop.trim())
    .filter(Boolean)
    .slice(0, CONTINUITY_LIMITS.maxRedirectHops);

  const primarySafety = summarizeUrlSafety(url ?? input.url);
  const redirectAssessment = assessRedirectChain(redirectChain.length > 0 ? redirectChain : url ? [url] : []);
  const fetchOutcome = resolveOutcome(input, primarySafety, redirectAssessment);

  const crossLinks = (input.crossLinks ?? [])
    .map((link) => canonicalizeUrl(link))
    .filter((link): link is string => Boolean(link))
    .slice(0, CONTINUITY_LIMITS.maxCrossLinks);

  const issues = [...new Set([...primarySafety.issues, ...redirectAssessment.issues])];

  let excludedReason: string | null = null;
  if (!subject) {
    excludedReason = "This observation names a subject that was not declared, so it cannot join a continuity series.";
  } else if (fetchOutcome === "blocked_unsafe") {
    excludedReason =
      "Private-network or otherwise unsafe URLs are not fetched or followed; this observation is recorded as blocked evidence only.";
  } else if (fetchOutcome === "missing_archive") {
    excludedReason = "No archive snapshot was available for this observation; continuity cannot be compared from it.";
  } else if (fetchOutcome === "source_failed") {
    excludedReason = "The source failed while collecting this observation; it is listed as a failure, not as a channel state.";
  } else if (!url && !normalizeHandle(input.handle) && !input.displayName?.trim()) {
    excludedReason = "This observation carries no URL, handle or display name, so it cannot take part in continuity diffs.";
  }

  return {
    observationId: input.observationId,
    subjectId: input.subjectId,
    identityKey,
    channelKind: input.channelKind,
    channelKey,
    observedAt: input.observedAt ?? null,
    url,
    handle: normalizeHandle(input.handle),
    displayName: input.displayName ? sanitizeText(input.displayName, 200) || null : null,
    claimKind: input.claimKind,
    sourceLabel: sanitizeText(input.sourceLabel, 160),
    sourceSnapshot: input.sourceSnapshot ? sanitizeText(input.sourceSnapshot) || null : null,
    redirectChain,
    fetchOutcome,
    crossLinks,
    urlSafety: {
      safe: primarySafety.safe && redirectAssessment.safe,
      hostname: primarySafety.hostname ?? redirectAssessment.finalHostname,
      normalizedUrl: primarySafety.normalizedUrl ?? url,
      issues,
    },
    excludedReason,
  };
}

export function analysable(observations: ChannelObservation[]): ChannelObservation[] {
  return observations.filter((observation) => observation.excludedReason === null);
}
