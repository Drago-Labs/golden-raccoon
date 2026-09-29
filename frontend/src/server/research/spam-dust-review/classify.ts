/**
 * Explainable classification signals.
 *
 * Dust requires a usable price and a tiny USD value. An unpriced holding —
 * including a high-balance one — gets an `unpriced` signal only, never
 * `tiny_value`, so it is not automatically hidden as dust.
 */
import { suspiciousLinkReason } from "./keys";
import { SPAM_DUST_LIMITS, type HoldingInput, type Signal } from "./schema";

function hasUsablePrice(holding: HoldingInput): boolean {
  return typeof holding.priceUsd === "number" && Number.isFinite(holding.priceUsd) && holding.priceUsd > 0;
}

export function classifyHolding(holding: HoldingInput): Signal[] {
  const signals: Signal[] = [];
  const priced = hasUsablePrice(holding);
  const valueUsd = holding.valueUsd ?? (priced && holding.priceUsd ? holding.balance * holding.priceUsd : 0);
  const allocation = holding.allocationPercent ?? 0;
  const symbol = holding.symbol.toUpperCase();
  const name = holding.name.toLowerCase();

  if (!priced) {
    // Unpriced holdings are never dust. A large balance without a price is
    // uncertain value, not a tiny residual — do not auto-hide it as dust.
    const substantialBalance = holding.balance > SPAM_DUST_LIMITS.tinyValueUsd;
    signals.push({
      kind: "unpriced",
      confidence: substantialBalance || valueUsd > 0 ? 0.7 : 0.9,
      detail: substantialBalance || valueUsd > SPAM_DUST_LIMITS.tinyValueUsd
        ? "No usable USD price; holding value is uncertain and is not treated as dust."
        : "No usable USD price is available for this holding.",
    });
  } else if (valueUsd > 0 && valueUsd < SPAM_DUST_LIMITS.tinyValueUsd) {
    const confidence = allocation < SPAM_DUST_LIMITS.tinyAllocationPercent ? 0.85 : 0.65;
    signals.push({
      kind: "tiny_value",
      confidence,
      detail: `Priced value is $${valueUsd.toFixed(4)}, below the $${SPAM_DUST_LIMITS.tinyValueUsd} dust threshold.`,
    });
  }

  const missingIssuer =
    !holding.isVerified &&
    !holding.issuer &&
    !holding.tokenAddress &&
    !holding.contractId;

  const spamNamed =
    !holding.isVerified &&
    (symbol.includes("AIRDROP") || symbol.includes("CLAIM") || name.includes("airdrop") || name.includes("claim"));

  if (missingIssuer || spamNamed) {
    signals.push({
      kind: "unknown_issuer",
      confidence: spamNamed ? 0.8 : 0.7,
      detail: spamNamed
        ? "Unverified holding uses airdrop/claim naming without a known issuer."
        : "Holding has no verified issuer, contract, or token address.",
    });
  }

  for (const candidate of [holding.logoUrl, holding.externalUrl]) {
    const reason = suspiciousLinkReason(candidate);
    if (reason) {
      signals.push({
        kind: "suspicious_link",
        confidence: 0.95,
        detail: `${reason} The URL was not fetched.`,
      });
      break;
    }
  }

  return signals;
}

export function reviewNote(signals: Signal[], hidden: boolean): string {
  if (signals.length === 0) {
    return hidden ? "Hidden by local preference; no spam/dust signals were raised." : "No spam or dust signals were raised.";
  }

  const kinds = signals.map((signal) => signal.kind.replaceAll("_", " ")).join(", ");
  const prefix = hidden ? "Hidden locally. " : "";
  return `${prefix}Signals: ${kinds}. Preferences never mutate on-chain holdings.`;
}
