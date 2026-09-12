import type { ConcentrationMetrics, GroupedExposureItem } from "./schema";
import { safeDecimal } from "./allocation";

/**
 * Evaluates entity concentration metrics including Herfindahl-Hirschman Index and dominant dependencies.
 */
export function calculateConcentration(
  issuers: GroupedExposureItem[],
  protocols: GroupedExposureItem[],
  totalPortfolioValueUsd: number
): ConcentrationMetrics {
  if (totalPortfolioValueUsd <= 0) {
    return {
      hhi: 0,
      classification: "well_diversified",
      topEntitySharePercent: 0,
      top3SharePercent: 0,
      dominantEntities: [],
    };
  }

  const entityShares = new Map<string, { name: string; sharePercent: number }>();

  for (const item of [...issuers, ...protocols]) {
    const existing = entityShares.get(item.entityId);
    if (!existing || item.portfolioSharePercent > existing.sharePercent) {
      entityShares.set(item.entityId, {
        name: item.name,
        sharePercent: item.portfolioSharePercent,
      });
    }
  }

  const sortedEntities = Array.from(entityShares.values()).sort(
    (a, b) => b.sharePercent - a.sharePercent
  );

  let hhiRaw = 0;
  for (const entity of sortedEntities) {
    hhiRaw += Math.pow(entity.sharePercent, 2);
  }
  const hhi = Math.min(10000, Math.round(hhiRaw));

  const topEntity = sortedEntities[0];
  const topEntitySharePercent = topEntity ? topEntity.sharePercent : 0;
  const topEntityName = topEntity ? topEntity.name : undefined;

  const top3SharePercent = safeDecimal(
    sortedEntities.slice(0, 3).reduce((sum, e) => sum + e.sharePercent, 0),
    2
  );

  const dominantEntities: string[] = [];
  for (const entity of sortedEntities) {
    if (entity.sharePercent >= 25) {
      dominantEntities.push(`${entity.name} (${entity.sharePercent.toFixed(1)}%)`);
    }
  }

  let classification: "well_diversified" | "moderate_concentration" | "high_concentration" =
    "well_diversified";
  if (hhi >= 2500 || topEntitySharePercent >= 40) {
    classification = "high_concentration";
  } else if (hhi >= 1500 || topEntitySharePercent >= 25) {
    classification = "moderate_concentration";
  }

  return {
    hhi,
    classification,
    topEntitySharePercent,
    topEntityName,
    top3SharePercent,
    dominantEntities,
  };
}
