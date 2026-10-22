import type { RoundingSample } from "./schema";

/**
 * Builds one rounding-table row from a sample deposit amount and the two
 * reads it needs: `previewDeposit(amount)` and `convertToAssets` of that
 * result. All comparisons are exact integer arithmetic — never floating
 * point — since even a one-unit rounding difference is the evidence this
 * table exists to surface.
 */
export function assessRounding(
  amount: bigint,
  sharesFromDeposit: bigint | null,
  assetsRoundTrip: bigint | null,
): RoundingSample {
  if (sharesFromDeposit === null || assetsRoundTrip === null) {
    return {
      amount: amount.toString(),
      sharesFromDeposit: sharesFromDeposit?.toString() ?? null,
      assetsRoundTrip: null,
      lossRaw: null,
      direction: "unavailable",
    };
  }

  const diff = amount - assetsRoundTrip;
  const direction = diff > 0n ? "favors_vault" : diff < 0n ? "favors_depositor" : "exact";

  return {
    amount: amount.toString(),
    sharesFromDeposit: sharesFromDeposit.toString(),
    assetsRoundTrip: assetsRoundTrip.toString(),
    lossRaw: diff.toString(),
    direction,
  };
}
