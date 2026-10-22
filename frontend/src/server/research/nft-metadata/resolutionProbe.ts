import { readPublicHttpsText } from "@/server/security/publicHttpsText";
import { classifyHosting, type HostingClassification } from "./hostingClassifier";
import { FETCH_TIMEOUT_MS, MAX_METADATA_BYTES, MEDIA_PROBE_BYTES } from "./limits";
import { sanitizeMetadata, type SafeNftMetadata } from "./safeMetadata";

export type MediaProbeResult = {
  uri: string;
  hosting: HostingClassification;
  resolved: boolean;
  reason: string;
};

export type MetadataResolution = {
  uri: string | null;
  hosting: HostingClassification | null;
  resolved: boolean;
  reason: string;
  metadata: SafeNftMetadata | null;
  media: MediaProbeResult | null;
};

function decodeDataUri(uri: string): { contentType: string; text: string } | null {
  const match = /^data:([^,;]*)(;base64)?,(.*)$/s.exec(uri);
  if (!match) return null;
  const [, mediaType, isBase64, payload] = match;
  try {
    const text = isBase64 ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload);
    return { contentType: mediaType || "text/plain", text };
  } catch {
    return null;
  }
}

/**
 * Probes a media URL (from a metadata document's `image`/`animation_url`)
 * for reachability without downloading it in full. A "response exceeds
 * byte limit" failure from the shared fetcher only ever fires after a
 * real, non-redirect response has started streaming, so it is treated as
 * a (truncated) success rather than a failure to resolve.
 */
async function probeMedia(uri: string | null): Promise<MediaProbeResult | null> {
  if (!uri) return null;
  const hosting = classifyHosting(uri);

  if (!hosting.fetchableUrl) {
    return {
      uri,
      hosting,
      resolved: hosting.kind === "onchain",
      reason: hosting.kind === "onchain" ? "inline data URI, nothing to fetch" : hosting.reason,
    };
  }

  try {
    await readPublicHttpsText(hosting.fetchableUrl, MEDIA_PROBE_BYTES, FETCH_TIMEOUT_MS);
    return { uri, hosting, resolved: true, reason: "resolved" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    if (message === "Response exceeds byte limit") {
      return { uri, hosting, resolved: true, reason: "resolved (truncated after the probe's byte cap)" };
    }
    return { uri, hosting, resolved: false, reason: message };
  }
}

/**
 * Resolves a `tokenURI`/`uri`/`contractURI` value to its metadata document,
 * classifying its hosting along the way. Every fetch of attacker-reachable
 * content goes through the shared SSRF-safe, DNS-pinned fetcher; fetched
 * JSON is parsed and immediately narrowed to known-safe fields via
 * `sanitizeMetadata` — the raw parsed object never escapes this module.
 */
export async function resolveMetadata(uri: string | null): Promise<MetadataResolution> {
  if (!uri) {
    return { uri: null, hosting: null, resolved: false, reason: "no URI returned on-chain", metadata: null, media: null };
  }

  const hosting = classifyHosting(uri);

  if (hosting.kind === "onchain") {
    const decoded = decodeDataUri(uri);
    if (!decoded) return { uri, hosting, resolved: false, reason: "malformed data: URI", metadata: null, media: null };
    if (!decoded.contentType.includes("json")) {
      return { uri, hosting, resolved: true, reason: "inline non-JSON data URI", metadata: null, media: null };
    }
    try {
      const metadata = sanitizeMetadata(JSON.parse(decoded.text));
      const media = await probeMedia(metadata.image ?? metadata.animationUrl ?? null);
      return { uri, hosting, resolved: true, reason: "resolved", metadata, media };
    } catch {
      return { uri, hosting, resolved: false, reason: "inline data URI did not parse as JSON", metadata: null, media: null };
    }
  }

  if (!hosting.fetchableUrl) {
    return { uri, hosting, resolved: false, reason: hosting.reason, metadata: null, media: null };
  }

  try {
    const body = await readPublicHttpsText(hosting.fetchableUrl, MAX_METADATA_BYTES, FETCH_TIMEOUT_MS);
    const metadata = sanitizeMetadata(JSON.parse(body));
    const media = await probeMedia(metadata.image ?? metadata.animationUrl ?? null);
    return { uri, hosting, resolved: true, reason: "resolved", metadata, media };
  } catch (error) {
    const message = error instanceof Error ? error.message : "fetch failed";
    return { uri, hosting, resolved: false, reason: message, metadata: null, media: null };
  }
}
