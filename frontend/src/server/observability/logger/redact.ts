const EVM_ADDR_RE = /0x[a-fA-F0-9]{40}/g;
const STELLAR_ADDR_RE = /G[A-Z2-9]{55}/g;
const URL_WITH_QUERY_RE = /https?:\/\/[\w\-./%?=&:#]+\?[\w\-./%?=&:#]+/g;
const TOKEN_LIKE_RE = /(?:eyJ|[A-Za-z0-9-_]{20,})/g;

function redactString(s: string): string {
  return s
    .replace(EVM_ADDR_RE, "<REDACTED_ADDRESS>")
    .replace(STELLAR_ADDR_RE, "<REDACTED_ADDRESS>")
    .replace(URL_WITH_QUERY_RE, "<REDACTED_URL>")
    .replace(TOKEN_LIKE_RE, (m) => (m.length > 30 ? "<REDACTED_TOKEN>" : m));
}

export function redact(obj: unknown): unknown {
  if (obj == null) return obj;
  if (typeof obj === "string") return redactString(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return obj;
  if (Array.isArray(obj)) return obj.map(redact);
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      // redact fields that look sensitive by key
      if (/pass(word)?|secret|token|key|credential|private|mnemonic|seed/i.test(k)) {
        out[k] = "<REDACTED>";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return String(obj);
}
