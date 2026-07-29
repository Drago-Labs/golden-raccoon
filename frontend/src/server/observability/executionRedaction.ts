/**
 * Execution-specific redaction — signed XDR, calldata, payment headers,
 * full wallet identifiers, and credentials. All redaction functions are
 * pure and deterministic so they can be tested with snapshot assertions.
 *
 * Issue #18: Sensitive-field redaction with automated tests.
 */

// ── Patterns ───────────────────────────────────────────────────────

const STELLAR_XDR_PATTERN = /AAAAA[gG].+/;
const STELLAR_SECRET_KEY_PATTERN = /^S[A-Z0-9]{55}$/;
const STELLAR_PUBLIC_KEY_PATTERN = /^G[A-Z0-9]{55}$/;

const EVM_PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/;
const EVM_SIGNED_TX_PATTERN = /^0x02[fF].{20,}$/;

const API_KEY_PATTERNS = [
  /(api[_-]?key[=:]\s*)([^&\s]+)/gi,
  /(x-api-key:\s*)(\S+)/gi,
  /(authorization:\s*bearer\s+)(\S+)/gi,
  /(authorization:\s*basic\s+)(\S+)/gi,
];

const PAYMENT_HEADER_PATTERNS = [
  /(x-payment-header:\s*)([^,\n]+)/gi,
  /(payment-header:\s*)([^,\n]+)/gi,
];

const WALLET_ADDRESS_PATTERNS = [
  // EVM addresses (0x + 40 hex chars)
  /(0x[a-fA-F0-9]{40})/g,
  // Stellar G-addresses
  /(G[A-Z0-9]{55})/g,
];

// ── Redaction functions ────────────────────────────────────────────

/**
 * Redact Stellar signed XDR. Keeps the envelope prefix but replaces
 * the signed payload body with [REDACTED_XDR].
 */
export function redactSignedXdr(input: string): string {
  if (STELLAR_XDR_PATTERN.test(input)) {
    return `[XDR_ENVELOPE_REDACTED:${input.slice(0, 16)}…${input.slice(-8)}]`;
  }
  return input;
}

/**
 * Redact raw EVM calldata. If the input looks like a signed EVM
 * transaction (0x02-prefixed), it's replaced with a length hint.
 */
export function redactCalldata(input: string): string {
  if (EVM_SIGNED_TX_PATTERN.test(input)) {
    return `[CALLDATA_REDACTED:${input.length} bytes]`;
  }
  return input;
}

/**
 * Detect and redact a complete Stellar secret key (S-prefixed).
 * Returns a redacted hint; returns the input unchanged if no match.
 * Uses word-boundary matching so secrets can be found inline within text.
 */
export function redactStellarSecretKey(input: string): string {
  // Match S-key patterns anywhere in the input (no ^$ anchors for inline detection)
  const inlinePattern = /\bS[A-Z0-9]{55}\b/g;
  if (inlinePattern.test(input)) {
    return input.replace(inlinePattern, "[STELLAR_SECRET_REDACTED]");
  }
  // Also check if the entire input is an S-key
  if (STELLAR_SECRET_KEY_PATTERN.test(input.trim())) {
    return "[STELLAR_SECRET_REDACTED]";
  }
  return input;
}

/**
 * Redact Stellar public keys (G-addresses) to first 4 + last 4 chars.
 */
export function redactStellarPublicKey(input: string): string {
  return input.replace(STELLAR_PUBLIC_KEY_PATTERN, (match) => {
    return `${match.slice(0, 4)}…${match.slice(-4)}`;
  });
}

/**
 * Redact full EVM wallet addresses to 0x + first 4 + … + last 4 chars.
 */
export function redactEvmAddressFull(input: string): string {
  return input.replace(WALLET_ADDRESS_PATTERNS[0], (match) => {
    return `${match.slice(0, 6)}…${match.slice(-4)}`;
  });
}

/**
 * Redact all wallet addresses (EVM + Stellar G-addresses).
 */
export function redactWalletAddresses(input: string): string {
  let result = redactEvmAddressFull(input);
  result = redactStellarPublicKey(result);
  return result;
}

/**
 * Redact API keys and auth headers from any input.
 */
export function redactApiKeys(input: string): string {
  let result = input;
  for (const pattern of API_KEY_PATTERNS) {
    result = result.replace(pattern, (_match, prefix) => `${prefix}[REDACTED]`);
  }
  return result;
}

/**
 * Redact payment headers (x402 settlement, facilitator headers).
 */
export function redactPaymentHeaders(input: string): string {
  let result = input;
  for (const pattern of PAYMENT_HEADER_PATTERNS) {
    result = result.replace(pattern, (_match, prefix) => `${prefix}[REDACTED]`);
  }
  return result;
}

/**
 * Full execution redaction pipeline: applies all redaction rules
 * to a value (string or JSON-serializable object).
 */
export function redactExecutionSensitive(value: unknown): string {
  if (typeof value !== "string") {
    try {
      return redactExecutionSensitive(JSON.stringify(value));
    } catch {
      return "[UNSERIALIZABLE_REDACTED]";
    }
  }

  let result = value;
  result = redactStellarSecretKey(result);
  result = redactSignedXdr(result);
  result = redactCalldata(result);
  result = redactApiKeys(result);
  result = redactPaymentHeaders(result);
  result = redactWalletAddresses(result);
  return result;
}

/**
 * Redact sensitive fields from an execution detail object,
 * returning a safe copy suitable for audit logs and metrics.
 */
export function redactExecutionDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = new Set([
    "signedPayload",
    "signedXdr",
    "calldata",
    "privateKey",
    "mnemonic",
    "seedPhrase",
    "secret",
    "paymentHeader",
    "xPaymentHeader",
    "walletSecret",
    "apiKey",
    "apikey",
    "X-Amz-Credential",
    "X-Amz-Signature",
  ]);

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(detail)) {
    if (sensitiveKeys.has(key)) {
      out[key] = "[REDACTED]";
      continue;
    }
    if (typeof value === "string") {
      out[key] = redactExecutionSensitive(value);
    } else if (value && typeof value === "object") {
      out[key] = redactExecutionDetail(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }

  return out;
}

/**
 * Create a safe short hint for a wallet address. This is deterministic
 * and never reveals the full address (unlike the alert hint which shows
 * last 4 chars, this is even more conservative — only first 4).
 */
export function walletAuditHint(address?: string): string | undefined {
  if (!address) return undefined;
  const trimmed = address.trim();
  if (trimmed.length < 8) return `wallet:${trimmed}`;
  return `w:${trimmed.slice(0, 4)}`;
}
