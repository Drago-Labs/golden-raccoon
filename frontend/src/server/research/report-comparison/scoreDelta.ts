import type { RiskSnapshotDocument } from "@/server/snapshots/schema";
import type {
  MissingDataDelta,
  MissingDataFieldDelta,
  ScoreDelta,
  ScoreDeltaDirection,
  ScoreMetricDelta,
} from "./schema";

function deriveDirection(delta: number): ScoreDeltaDirection {
  if (delta > 0) return "increased";
  if (delta < 0) return "decreased";
  return "unchanged";
}

function calculateMetricDelta(baseValue: number, targetValue: number): ScoreMetricDelta {
  const delta = Number((targetValue - baseValue).toFixed(4));
  return {
    base: baseValue,
    target: targetValue,
    delta,
    direction: deriveDirection(delta),
  };
}

function compareMissingData(
  baseList: RiskSnapshotDocument["missingData"],
  targetList: RiskSnapshotDocument["missingData"],
): MissingDataDelta {
  const baseMap = new Map<string, "low" | "medium" | "high">();
  for (const item of baseList) {
    baseMap.set(item.field, item.impact);
  }

  const targetMap = new Map<string, "low" | "medium" | "high">();
  for (const item of targetList) {
    targetMap.set(item.field, item.impact);
  }

  const added: MissingDataFieldDelta[] = [];
  const removed: MissingDataFieldDelta[] = [];
  const retained: MissingDataFieldDelta[] = [];
  const knownToUnknown: string[] = [];
  const unknownToKnown: string[] = [];

  for (const [field, impact] of targetMap.entries()) {
    if (!baseMap.has(field)) {
      added.push({ field, impact });
      knownToUnknown.push(field);
    } else {
      retained.push({ field, impact });
    }
  }

  for (const [field, impact] of baseMap.entries()) {
    if (!targetMap.has(field)) {
      removed.push({ field, impact });
      unknownToKnown.push(field);
    }
  }

  added.sort((a, b) => a.field.localeCompare(b.field));
  removed.sort((a, b) => a.field.localeCompare(b.field));
  retained.sort((a, b) => a.field.localeCompare(b.field));
  knownToUnknown.sort((a, b) => a.localeCompare(b));
  unknownToKnown.sort((a, b) => a.localeCompare(b));

  return {
    added,
    removed,
    retained,
    totalBase: baseList.length,
    totalTarget: targetList.length,
    unknownToKnown,
    knownToUnknown,
  };
}

/**
 * Computes semantic score differences, verdict transitions, and missing data
 * shifts between baseline and target risk snapshots.
 *
 * @param base - Baseline risk snapshot document.
 * @param target - Target risk snapshot document.
 * @returns Comprehensive ScoreDelta object separating numeric changes from missing data transitions.
 */
export function calculateScoreDelta(
  base: RiskSnapshotDocument,
  target: RiskSnapshotDocument,
): ScoreDelta {
  const buyRisk = calculateMetricDelta(base.scores.buyRisk, target.scores.buyRisk);
  const confidence = calculateMetricDelta(base.scores.confidence, target.scores.confidence);

  const verdict = {
    base: base.verdict,
    target: target.verdict,
    changed: base.verdict !== target.verdict,
  };

  const missingData = compareMissingData(base.missingData, target.missingData);

  return {
    buyRisk,
    confidence,
    verdict,
    missingData,
  };
}
