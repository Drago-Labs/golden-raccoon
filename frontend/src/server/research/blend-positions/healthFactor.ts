import { BLEND_POSITION_LIMITS } from "./limits";
import type { ConvertedPosition, HealthFactorBreakdown } from "./schema";

/**
 * Computes effective collateral, effective liabilities, and health factor.
 * If any position with non-zero supply or borrow lacks an oracle price, the
 * health factor is left unavailable (null) rather than estimated.
 */
export function computeHealthFactor(
  positions: ConvertedPosition[],
  missingOracleAssets: string[],
): HealthFactorBreakdown {
  if (missingOracleAssets.length > 0) {
    return {
      available: false,
      unavailableReason: `Missing oracle price for: ${missingOracleAssets.join(", ")}`,
      totalSupplyUsd: null,
      totalBorrowUsd: null,
      effectiveCollateralUsd: null,
      effectiveLiabilityUsd: null,
      healthFactor: null,
      status: "unavailable",
    };
  }

  let totalSupplyUsd = 0;
  let totalBorrowUsd = 0;
  let effectiveCollateralUsd = 0;
  let effectiveLiabilityUsd = 0;

  for (const pos of positions) {
    if (pos.supplyValueUsd === null || pos.borrowValueUsd === null) {
      return {
        available: false,
        unavailableReason: `Missing valuation for ${pos.symbol}`,
        totalSupplyUsd: null,
        totalBorrowUsd: null,
        effectiveCollateralUsd: null,
        effectiveLiabilityUsd: null,
        healthFactor: null,
        status: "unavailable",
      };
    }
    totalSupplyUsd += pos.supplyValueUsd;
    totalBorrowUsd += pos.borrowValueUsd;
    effectiveCollateralUsd += pos.effectiveCollateralUsd ?? 0;
    effectiveLiabilityUsd += pos.effectiveLiabilityUsd ?? 0;
  }

  totalSupplyUsd = Number(totalSupplyUsd.toFixed(6));
  totalBorrowUsd = Number(totalBorrowUsd.toFixed(6));
  effectiveCollateralUsd = Number(effectiveCollateralUsd.toFixed(6));
  effectiveLiabilityUsd = Number(effectiveLiabilityUsd.toFixed(6));

  if (effectiveLiabilityUsd <= 0) {
    return {
      available: true,
      unavailableReason: null,
      totalSupplyUsd,
      totalBorrowUsd,
      effectiveCollateralUsd,
      effectiveLiabilityUsd,
      healthFactor: null,
      status: "no_debt",
    };
  }

  const hf = Number((effectiveCollateralUsd / effectiveLiabilityUsd).toFixed(4));
  const status = hf < 1 ? "liquidatable" : hf < 1.15 ? "near_liquidation" : "healthy";

  return {
    available: true,
    unavailableReason: null,
    totalSupplyUsd,
    totalBorrowUsd,
    effectiveCollateralUsd,
    effectiveLiabilityUsd,
    healthFactor: hf,
    status,
  };
}

export function valuePositionWithFactors(input: {
  supplyTokens: number;
  borrowTokens: number;
  priceUsd: number | null;
  collateralFactorBps: number;
  liabilityFactorBps: number;
}): {
  supplyValueUsd: number | null;
  borrowValueUsd: number | null;
  effectiveCollateralUsd: number | null;
  effectiveLiabilityUsd: number | null;
} {
  if (input.priceUsd === null || !Number.isFinite(input.priceUsd) || input.priceUsd <= 0) {
    return {
      supplyValueUsd: null,
      borrowValueUsd: null,
      effectiveCollateralUsd: null,
      effectiveLiabilityUsd: null,
    };
  }
  const scale = BLEND_POSITION_LIMITS.factorBpsScale;
  const supplyValueUsd = Number((input.supplyTokens * input.priceUsd).toFixed(6));
  const borrowValueUsd = Number((input.borrowTokens * input.priceUsd).toFixed(6));
  const effectiveCollateralUsd = Number(((supplyValueUsd * input.collateralFactorBps) / scale).toFixed(6));
  const effectiveLiabilityUsd = Number(((borrowValueUsd * scale) / input.liabilityFactorBps).toFixed(6));
  return {
    supplyValueUsd,
    borrowValueUsd,
    effectiveCollateralUsd,
    effectiveLiabilityUsd,
  };
}
