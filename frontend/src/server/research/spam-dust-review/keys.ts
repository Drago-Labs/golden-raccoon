/**
 * Chain-aware asset keys and URL safety checks.
 *
 * Preferences never share across networks: the same symbol on Stellar and
 * Ethereum is a different key. Token-provided URLs are inspected as strings —
 * never fetched — and unsafe schemes are flagged.
 */
import type { AssetKeyParts, HoldingInput } from "./schema";

export function assetKeyParts(holding: HoldingInput, fallbackChainId: string): AssetKeyParts {
  return {
    chainId: (holding.chainId ?? fallbackChainId).trim().toLowerCase(),
    symbol: holding.symbol.trim().toUpperCase(),
    tokenAddress: holding.tokenAddress?.trim().toLowerCase() || null,
    issuer: holding.issuer?.trim() || null,
    contractId: holding.contractId?.trim() || null,
  };
}

export function assetKeyFor(holding: HoldingInput, fallbackChainId: string): string {
  const parts = assetKeyParts(holding, fallbackChainId);
  return [parts.chainId, parts.symbol, parts.tokenAddress ?? "", parts.issuer ?? "", parts.contractId ?? ""].join("|");
}

/**
 * Inspect a URL without fetching it. Returns null when safe or absent, otherwise
 * a reason the link is suspicious.
 */
export function suspiciousLinkReason(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Link is not a parseable URL.";
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === "javascript:" || protocol === "data:" || protocol === "file:" || protocol === "blob:") {
    return `Unsafe URL scheme (${protocol}).`;
  }

  if (protocol !== "http:" && protocol !== "https:") {
    return `Non-web URL scheme (${protocol}).`;
  }

  if (protocol === "http:") {
    return "Insecure http link from token metadata.";
  }

  const host = parsed.hostname.toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host === "localhost" || host.endsWith(".local")) {
    return "Link points at a raw host or localhost rather than a public domain.";
  }

  // Homoglyph / lookalike bait often packs @ userinfo into metadata URLs.
  if (parsed.username || parsed.password) {
    return "Link embeds credentials or userinfo.";
  }

  return null;
}
