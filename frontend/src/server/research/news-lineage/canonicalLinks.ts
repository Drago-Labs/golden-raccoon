/**
 * URL canonicalization and outlet identity.
 *
 * Two articles at the same canonical URL are the same article. Tracking
 * parameters, fragments and trailing slashes are stripped so a share link and a
 * direct link do not look like two independent reports.
 *
 * Nothing here fetches a URL. Canonicalization is pure string work.
 */

/** Query parameters that identify a campaign, not a document. */
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

export function canonicalizeUrl(raw: string | null): string | null {
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
  parsed.protocol = "https:";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";

  const sorted = [...parsed.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right));
  parsed.search = "";
  for (const [key, value] of sorted) parsed.searchParams.append(key, value);

  return parsed.toString();
}

/** Outlet identity: the hostname without a `www.` prefix. */
export function outletIdFor(raw: string | null): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();

  try {
    return new URL(trimmed).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    const bare = trimmed.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(bare) ? bare : null;
  }
}
