/** Canonical asset key helpers — same-symbol assets never collapse across issuers. */

export function normalizeAssetKey(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.toUpperCase() === "XLM" || trimmed.toLowerCase() === "native") return "native";
  const separator = trimmed.indexOf(":");
  if (separator > 0) {
    const code = trimmed.slice(0, separator).trim().toUpperCase();
    const issuer = trimmed.slice(separator + 1).trim();
    if (!code || !issuer) return null;
    return `classic:${code}:${issuer}`;
  }
  if (trimmed.startsWith("C") && trimmed.length >= 56) return `contract:${trimmed}`;
  return null;
}

export function assetKeysEqual(left: string, right: string): boolean {
  return left === right;
}

/** Exact decimal strings only — never use floating point for onchain amounts. */
export function isExactAmount(value: string): boolean {
  return /^\d+(\.\d{1,7})?$/.test(value);
}

export function assertStrictModeLimits(
  mode: "strict_send" | "strict_receive",
  sourceAmount: string,
  destinationAmount: string,
): string | null {
  if (!isExactAmount(sourceAmount) || !isExactAmount(destinationAmount)) {
    return "Amounts must be exact decimal strings with at most 7 fractional digits.";
  }
  if (mode === "strict_send" && sourceAmount === "0") {
    return "Strict-send source amount must be positive.";
  }
  if (mode === "strict_receive" && destinationAmount === "0") {
    return "Strict-receive destination amount must be positive.";
  }
  return null;
}
