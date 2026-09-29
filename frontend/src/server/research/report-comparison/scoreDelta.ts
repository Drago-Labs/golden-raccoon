/**
 * Numeric and verdict deltas.
 *
 * The point of this module is the `DeltaDirection` enum: a value that was
 * unknown and became known is reported as `unknown_to_known`, never as an
 * increase from zero, and the reverse is `known_to_unknown` rather than a
 * decrease.
 */
import { COMPARISON_LIMITS, type DeltaDirection, type ScoreDelta, type VerdictDelta } from "./schema";

export function numericDelta(
  field: ScoreDelta["field"],
  left: number | null | undefined,
  right: number | null | undefined,
  descriptor = field,
): ScoreDelta {
  const leftValue = typeof left === "number" && Number.isFinite(left) ? left : null;
  const rightValue = typeof right === "number" && Number.isFinite(right) ? right : null;

  let direction: DeltaDirection;
  let note: string;

  if (leftValue === null && rightValue === null) {
    direction = "unknown_both";
    note = `${descriptor} was not observable in either snapshot.`;
  } else if (leftValue === null) {
    direction = "unknown_to_known";
    note = `${descriptor} became observable. There is no earlier value to measure a change against.`;
  } else if (rightValue === null) {
    direction = "known_to_unknown";
    note = `${descriptor} stopped being observable. This is a loss of visibility, not a measured decrease.`;
  } else {
    const change = rightValue - leftValue;
    if (Math.abs(change) <= COMPARISON_LIMITS.scoreEpsilon) {
      direction = "unchanged";
      note = `${descriptor} is identical in both observations.`;
    } else if (change > 0) {
      direction = "increase";
      note = `${descriptor} rose by ${Math.abs(change)}.`;
    } else {
      direction = "decrease";
      note = `${descriptor} fell by ${Math.abs(change)}.`;
    }
  }

  return {
    field,
    left: leftValue,
    right: rightValue,
    absoluteChange: leftValue !== null && rightValue !== null ? Number((rightValue - leftValue).toFixed(6)) : null,
    direction,
    note,
  };
}

export function buildScoreDeltas(
  left: { buyRisk: number; confidence: number },
  right: { buyRisk: number; confidence: number },
): ScoreDelta[] {
  return [
    numericDelta("buyRisk", left.buyRisk, right.buyRisk, "Buy risk"),
    numericDelta("confidence", left.confidence, right.confidence, "Confidence"),
  ];
}

export function buildVerdictDelta(left: string, right: string): VerdictDelta {
  const changed = left !== right;

  return {
    left,
    right,
    changed,
    note: changed
      ? `The verdict moved from ${left} to ${right}.`
      : `The verdict is ${left} in both observations.`,
  };
}
