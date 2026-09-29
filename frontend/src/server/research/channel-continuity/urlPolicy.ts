/**
 * URL policy for channel continuity.
 *
 * Observations may carry URLs and redirect chains, but this module never
 * fetches them. It only classifies supplied strings with the shared URL-safety
 * helpers so private-network targets and unsafe redirects stay blocked.
 */
import { evaluateUrlSafety, getHostname, isPrivateOrLocalHost } from "@/server/security/urlSafety";
import type { UrlSafetySummary } from "./schema";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "ref",
  "ref_src",
]);

export function canonicalizeUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key);
  }

  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";

  return parsed.toString();
}

export function hostnameOf(raw: string | null | undefined): string | null {
  const canonical = canonicalizeUrl(raw);
  if (!canonical) return getHostname(raw ?? undefined) ?? null;
  return getHostname(canonical) ?? null;
}

export function summarizeUrlSafety(raw: string | null | undefined): UrlSafetySummary {
  if (!raw?.trim()) {
    return { safe: true, hostname: null, normalizedUrl: null, issues: [] };
  }

  const result = evaluateUrlSafety(raw.trim());
  return {
    safe: result.safe,
    hostname: result.hostname ?? null,
    normalizedUrl: result.normalizedUrl ?? canonicalizeUrl(raw),
    issues: result.issues,
  };
}

/**
 * Walk a supplied redirect chain. Any private-network hop or otherwise unsafe
 * URL marks the whole chain blocked — nothing is fetched to follow it.
 */
export function assessRedirectChain(chain: string[]): {
  safe: boolean;
  blockedHops: string[];
  finalHostname: string | null;
  issues: string[];
} {
  const blockedHops: string[] = [];
  const issues: string[] = [];
  let finalHostname: string | null = null;

  for (const hop of chain) {
    const safety = summarizeUrlSafety(hop);
    finalHostname = safety.hostname ?? finalHostname;

    if (!safety.safe) {
      blockedHops.push(hop);
      issues.push(...safety.issues.map((issue) => `${safety.hostname ?? hop}: ${issue}`));
    }

    const host = safety.hostname;
    if (host && isPrivateOrLocalHost(host)) {
      if (!blockedHops.includes(hop)) blockedHops.push(hop);
      if (!issues.some((issue) => issue.includes("private or localhost"))) {
        issues.push(`${host}: private or localhost target blocked`);
      }
    }
  }

  return {
    safe: blockedHops.length === 0,
    blockedHops,
    finalHostname,
    issues: [...new Set(issues)],
  };
}

/** Lookalike domains stay distinct — skeleton similarity is recorded, never merged. */
export function domainsAreDistinct(left: string | null, right: string | null): boolean {
  if (!left || !right) return left !== right;
  return left.toLowerCase().replace(/^www\./, "") !== right.toLowerCase().replace(/^www\./, "");
}
