/**
 * Metadata fetched from an attacker-reachable URI (a contract's own
 * `tokenURI`, a gateway, or any server it points to) is untrusted input.
 * This module extracts only a fixed set of known, primitive fields with
 * bounded length — never arbitrary nested objects, never anything treated
 * as HTML or markup — so a malicious payload can at most show up as a
 * plain, length-capped string in the UI, which React already escapes.
 */

const MAX_FIELD_LENGTH = 2_000;

export type SafeNftMetadata = {
  name: string | null;
  description: string | null;
  image: string | null;
  animationUrl: string | null;
  attributesCount: number | null;
};

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_FIELD_LENGTH) : null;
}

export function sanitizeMetadata(raw: unknown): SafeNftMetadata {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { name: null, description: null, image: null, animationUrl: null, attributesCount: null };
  }

  const record = raw as Record<string, unknown>;
  return {
    name: safeString(record.name),
    description: safeString(record.description),
    image: safeString(record.image),
    animationUrl: safeString(record.animation_url),
    attributesCount: Array.isArray(record.attributes) ? record.attributes.length : null,
  };
}
