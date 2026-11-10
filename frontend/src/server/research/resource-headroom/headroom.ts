import { extractResourceMap, RESOURCE_DEFINITIONS } from "./resourceExtraction";
import type {
  NetworkLimitSet,
  RawResourceMetrics,
  ResourceHeadroomItem,
} from "./schema";

export function computeResourceHeadroom(
  metrics: RawResourceMetrics,
  limitSet: NetworkLimitSet,
  warningThresholdPct: number,
): ResourceHeadroomItem[] {
  const usedMap = extractResourceMap(metrics);

  return RESOURCE_DEFINITIONS.map((def) => {
    const used = usedMap[def.key];
    const limit = limitSet.limits[def.key];
    const utilizationPct = Number(((used / limit) * 100).toFixed(2));
    const headroomRemaining = Math.max(0, limit - used);
    const headroomPct = Number(Math.max(0, 100 - utilizationPct).toFixed(2));
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      used,
      limit,
      fractionDisplay: `${used} / ${limit}`,
      utilizationPct,
      headroomRemaining,
      headroomPct,
      flagged: utilizationPct >= warningThresholdPct,
    };
  });
}
