/**
 * URL canonicalization for advisory links.
 *
 * Nothing here fetches a URL. Tracking parameters are stripped so a share link
 * and a direct link do not look like two independent advisories.
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "source",
  "cmpid",
  "icid",
]);

export function canonicalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;

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

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  const query = parsed.searchParams.toString();
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${query ? `?${query}` : ""}`;
}

export function outletIdFor(domain: string, outletId?: string | null): string {
  if (outletId?.trim()) return outletId.trim().toLowerCase();
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/** Jaccard similarity over word tokens. Pure, no network. */
export function textSimilarity(left: string, right: string): number {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));

  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
