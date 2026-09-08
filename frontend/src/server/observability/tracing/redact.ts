const EVM_WALLET_RE = /0x[a-fA-F0-9]{40}/g;
const STELLAR_WALLET_RE = /\bG[A-Z2-7]{55}\b/g;
const SECRET_LIKE_RE = /\b(?:sk|pk|api|secret|token|bearer)[-_a-z0-9]{4,}\b/gi;

const SENSITIVE_KEY_RE =
  /(?:wallet|address|account|balance|amount|payload|authorization|credential|secret|token|key|mnemonic|seed|signed|payto|payer|private)/i;

export function redactString(value: string): string {
  return value
    .replace(EVM_WALLET_RE, "[REDACTED_WALLET]")
    .replace(STELLAR_WALLET_RE, "[REDACTED_WALLET]")
    .replace(SECRET_LIKE_RE, "[REDACTED_SECRET]");
}

function redactValue(key: string, value: unknown): unknown {
  if (value == null) return value;
  if (SENSITIVE_KEY_RE.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((entry, index) => redactValue(`${key}[${index}]`, entry));
  if (typeof value === "object") return redactSpanAttributes(value as Record<string, unknown>);
  return redactString(String(value));
}

export function redactSpanAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    redacted[key] = redactValue(key, value);
  }
  return redacted;
}

export function extractResultCode(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  if (typeof record.code === "string" && record.code.trim()) return record.code.trim();

  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.code === "string" && nested.code.trim()) return nested.code.trim();
  }

  return undefined;
}
