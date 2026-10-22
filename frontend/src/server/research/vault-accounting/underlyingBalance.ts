import type { UnderlyingBalanceComparison } from "./schema";

/**
 * Compares a vault's reported `totalAssets()` against the vault
 * contract's own ERC-20 balance of its underlying asset. A gap does not
 * by itself mean assets are missing — a vault may deploy capital into a
 * strategy — but it is exactly the fact a donation-based share-price
 * manipulation, or an inflated `totalAssets`, would hide if left
 * unreported.
 */
export function compareUnderlyingBalance(
  totalAssets: bigint | null,
  actualBalance: bigint | null,
): UnderlyingBalanceComparison {
  const assetsElsewhere =
    totalAssets !== null && actualBalance !== null && totalAssets > actualBalance
      ? (totalAssets - actualBalance).toString()
      : totalAssets !== null && actualBalance !== null
        ? "0"
        : null;

  return {
    totalAssets: totalAssets?.toString() ?? null,
    actualBalance: actualBalance?.toString() ?? null,
    assetsElsewhere,
    deficit: totalAssets !== null && actualBalance !== null && actualBalance < totalAssets,
  };
}
