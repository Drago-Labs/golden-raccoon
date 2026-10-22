import { SHARE_PRICE_SCALE } from "./limits";
import type { SharePrice } from "./schema";

/**
 * Assets-per-share from `totalAssets / totalSupply`, scaled to an integer
 * by `SHARE_PRICE_SCALE` so no precision is lost to floating point. This
 * mirrors what `convertToAssets(1 share)` would report for a vault with
 * no deposit/withdraw fee, without risking a zero result from rounding a
 * single share down for a high-value vault.
 */
export function computeSharePrice(totalAssets: bigint | null, totalSupply: bigint | null): SharePrice | null {
  if (totalAssets === null || totalSupply === null || totalSupply <= 0n) return null;
  return {
    assetsPerShareScaled: ((totalAssets * SHARE_PRICE_SCALE) / totalSupply).toString(),
    scale: SHARE_PRICE_SCALE.toString(),
  };
}
