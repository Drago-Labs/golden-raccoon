import type { ValidityWindow } from "./schema";

export type WindowInputs = {
  timeEarliestUnix: number | null;
  timeLatestUnix: number | null;
  ledgerEarliest: number | null;
  ledgerLatest: number | null;
  sequenceEarliestUnix: number | null;
  sequenceEarliestLedger: number | null;
  currentlySatisfied: boolean;
  invalidReasons: string[];
};

function toIso(unix: number | null): string | null {
  if (unix === null || !Number.isFinite(unix)) return null;
  return new Date(unix * 1000).toISOString();
}

function maxNumber(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return Math.max(...present);
}

function minNumber(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;
  return Math.min(...present);
}

/**
 * Combine time, ledger, and sequence constraints into the earliest and latest
 * submission windows. Empty sides stay null (unbounded).
 */
export function computeValidityWindow(input: WindowInputs): ValidityWindow {
  const earliestSubmitAt = toIso(maxNumber([input.timeEarliestUnix, input.sequenceEarliestUnix]));
  const latestSubmitAt = toIso(input.timeLatestUnix);
  const earliestLedger = maxNumber([input.ledgerEarliest, input.sequenceEarliestLedger]);
  const latestLedger = input.ledgerLatest;

  return {
    earliestSubmitAt,
    latestSubmitAt,
    earliestLedger,
    latestLedger,
    currentlyValid: input.currentlySatisfied && input.invalidReasons.length === 0,
    invalidReasons: [...input.invalidReasons],
  };
}
