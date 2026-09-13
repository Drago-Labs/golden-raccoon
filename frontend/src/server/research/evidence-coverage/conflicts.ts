/**
 * Contradiction detection.
 *
 * A contradiction is a claim about the world, so this module refuses to make
 * one unless it can be proved. Every pair is checked for comparability first,
 * and a pair that fails any check is recorded as *incomparable* with the reason
 * — visible to the reader, but never counted as a conflict.
 *
 * Free text is never adjudicated. Two prose descriptions differing is not
 * evidence of disagreement, and this feature does not pretend to read them.
 */
import type { ClaimInput, Contradiction, ComparabilityReason, SourceObservation } from "./schema";

function windowsOverlap(left: SourceObservation, right: SourceObservation): boolean | null {
  // A value with no declared window is taken to describe the moment it was
  // observed, so an observation with neither a window nor a timestamp cannot be
  // placed in time at all.
  const leftStart = Date.parse(left.windowStart ?? left.observedAt ?? "");
  const leftEnd = Date.parse(left.windowEnd ?? left.observedAt ?? "");
  const rightStart = Date.parse(right.windowStart ?? right.observedAt ?? "");
  const rightEnd = Date.parse(right.windowEnd ?? right.observedAt ?? "");

  if (![leftStart, leftEnd, rightStart, rightEnd].every(Number.isFinite)) return null;

  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function assessComparability(
  left: SourceObservation,
  right: SourceObservation,
): { reason: ComparabilityReason; detail: string } {
  if (left.value === null || right.value === null) {
    return {
      reason: "unstructured_value",
      detail: "At least one observation carries no value, so there is nothing to compare.",
    };
  }

  if (left.value.kind !== "number" || right.value.kind !== "number") {
    return {
      reason: "unstructured_value",
      detail: "Free text is not adjudicated. Two descriptions differing is not evidence that they disagree.",
    };
  }

  if (left.value.unit.trim().toLowerCase() !== right.value.unit.trim().toLowerCase()) {
    return {
      reason: "different_unit",
      detail: `These values are in different units (${left.value.unit} and ${right.value.unit}). A difference between them is a unit mismatch, not a disagreement.`,
    };
  }

  const overlap = windowsOverlap(left, right);

  if (overlap === null) {
    return {
      reason: "missing_timestamp",
      detail: "At least one observation cannot be placed in time, so it is unknown whether these describe the same moment.",
    };
  }

  if (!overlap) {
    return {
      reason: "disjoint_windows",
      detail: "These observations describe non-overlapping windows. A difference between them is a change over time, not a contradiction.",
    };
  }

  return { reason: "comparable", detail: "Same identity, same unit, overlapping windows, both structured." };
}

export type ConflictScan = {
  contradictions: Contradiction[];
  incomparablePairs: Contradiction[];
  /** Pairs that were comparable and reported the same value. */
  agreeingPairCount: number;
};

export function findContradictions(claim: ClaimInput, observations: SourceObservation[]): ConflictScan {
  const contradictions: Contradiction[] = [];
  const incomparablePairs: Contradiction[] = [];
  let agreeingPairCount = 0;

  for (let i = 0; i < observations.length; i += 1) {
    for (let j = i + 1; j < observations.length; j += 1) {
      const left = observations[i];
      const right = observations[j];
      const { reason, detail } = assessComparability(left, right);

      const base = {
        claimId: claim.claimId,
        leftObservationId: left.observationId,
        rightObservationId: right.observationId,
      };

      if (reason !== "comparable") {
        incomparablePairs.push({ ...base, reason, difference: null, detail });
        continue;
      }

      const leftAmount = (left.value as { kind: "number"; amount: string }).amount;
      const rightAmount = (right.value as { kind: "number"; amount: string }).amount;

      if (normalizeNumber(leftAmount) === normalizeNumber(rightAmount)) {
        // Only a comparison that actually happened counts as agreement.
        if (left.familyId !== right.familyId) agreeingPairCount += 1;
        continue;
      }

      contradictions.push({
        ...base,
        reason: "comparable",
        difference: `${leftAmount} vs ${rightAmount}`,
        detail: `Two comparable observations report different values for the same claim over overlapping windows: ${leftAmount} and ${rightAmount} ${(left.value as { unit: string }).unit}.`,
      });
    }
  }

  return { contradictions, incomparablePairs, agreeingPairCount };
}

/** Compares decimal strings by value, so "1.50" and "1.5" are not a conflict. */
function normalizeNumber(value: string): string {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const [whole, fraction = ""] = (negative ? trimmed.slice(1) : trimmed).split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");

  return `${negative ? "-" : ""}${normalizedWhole}${normalizedFraction ? `.${normalizedFraction}` : ""}`;
}
