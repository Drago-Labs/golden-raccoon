import type { ConvertedPosition, HealthFactorBreakdown, LiquidationScenario } from "./schema";

/**
 * Computes single-asset price movement required to bring health factor to 1.0,
 * holding all other asset prices constant.
 */
export function computeLiquidationScenarios(
  positions: ConvertedPosition[],
  health: HealthFactorBreakdown,
): LiquidationScenario[] {
  if (
    !health.available ||
    health.effectiveCollateralUsd === null ||
    health.effectiveLiabilityUsd === null ||
    health.effectiveLiabilityUsd <= 0
  ) {
    return [];
  }

  const totalC = health.effectiveCollateralUsd;
  const totalL = health.effectiveLiabilityUsd;
  const scenarios: LiquidationScenario[] = [];

  for (const pos of positions) {
    if (pos.priceUsd === null || pos.priceUsd <= 0) continue;
    const cAsset = pos.effectiveCollateralUsd ?? 0;
    const lAsset = pos.effectiveLiabilityUsd ?? 0;

    // If net collateral contributor (cAsset > lAsset), a price drop triggers liquidation
    if (cAsset > lAsset) {
      const otherC = totalC - cAsset;
      const otherL = totalL - lAsset;
      const requiredRatio = (otherL - otherC) / (cAsset - lAsset);
      if (requiredRatio <= 0) {
        scenarios.push({
          assetId: pos.assetId,
          symbol: pos.symbol,
          role: "collateral",
          currentPriceUsd: pos.priceUsd,
          liquidationPriceUsd: null,
          priceMovePctToLiquidation: null,
          explanation: `Other collateral already covers liabilities even if ${pos.symbol} falls to $0.`,
        });
      } else {
        const liqPrice = Number((pos.priceUsd * requiredRatio).toFixed(6));
        const movePct = Number(((requiredRatio - 1) * 100).toFixed(2));
        scenarios.push({
          assetId: pos.assetId,
          symbol: pos.symbol,
          role: "collateral",
          currentPriceUsd: pos.priceUsd,
          liquidationPriceUsd: liqPrice,
          priceMovePctToLiquidation: movePct,
          explanation: `${pos.symbol} price change of ${movePct}% (to $${liqPrice.toFixed(4)}) reaches HF = 1.0.`,
        });
      }
    }

    // If net liability contributor (lAsset > cAsset), a price rise triggers liquidation
    if (lAsset > cAsset) {
      const otherC = totalC - cAsset;
      const otherL = totalL - lAsset;
      const requiredRatio = (otherC - otherL) / (lAsset - cAsset);
      if (requiredRatio <= 0) {
        scenarios.push({
          assetId: pos.assetId,
          symbol: pos.symbol,
          role: "liability",
          currentPriceUsd: pos.priceUsd,
          liquidationPriceUsd: null,
          priceMovePctToLiquidation: null,
          explanation: `Position is already at or below liquidation threshold.`,
        });
      } else {
        const liqPrice = Number((pos.priceUsd * requiredRatio).toFixed(6));
        const movePct = Number(((requiredRatio - 1) * 100).toFixed(2));
        scenarios.push({
          assetId: pos.assetId,
          symbol: pos.symbol,
          role: "liability",
          currentPriceUsd: pos.priceUsd,
          liquidationPriceUsd: liqPrice,
          priceMovePctToLiquidation: movePct,
          explanation: `${pos.symbol} price change of +${movePct}% (to $${liqPrice.toFixed(4)}) reaches HF = 1.0.`,
        });
      }
    }
  }

  return scenarios;
}
