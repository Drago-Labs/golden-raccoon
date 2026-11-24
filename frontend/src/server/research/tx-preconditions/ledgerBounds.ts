import type { DecodedPreconditions } from "./envelopeDecode";
import type { PreconditionRow } from "./schema";

export type LedgerBoundsEvaluation = {
  rows: PreconditionRow[];
  earliestLedger: number | null;
  latestLedger: number | null;
  satisfied: boolean;
  reasons: string[];
};

/**
 * Evaluate CAP-21 ledger bounds: minLedger <= n < maxLedger (maxLedger 0 = unbounded).
 */
export function evaluateLedgerBounds(
  preconditions: DecodedPreconditions,
  currentLedger: number | null,
): LedgerBoundsEvaluation {
  const min = preconditions.minLedger;
  const max = preconditions.maxLedger;
  const present = (min !== null && min > 0) || (max !== null && max > 0);
  const earliestLedger = min && min > 0 ? min : null;
  const latestLedger = max && max > 0 ? max - 1 : null;
  const reasons: string[] = [];

  if (!present) {
    return {
      rows: [
        {
          name: "ledgerBounds",
          present: false,
          value: null,
          status: "not_set",
          explanation: "No ledger bounds are set. The envelope is not restricted by ledger number.",
        },
      ],
      earliestLedger: null,
      latestLedger: null,
      satisfied: true,
      reasons: [],
    };
  }

  const value = `minLedger=${min ?? 0}, maxLedger=${max ?? 0}`;

  if (currentLedger === null) {
    return {
      rows: [
        {
          name: "ledgerBounds",
          present: true,
          value,
          status: "unknown",
          explanation: "Ledger bounds are present but the current ledger number is unavailable.",
        },
      ],
      earliestLedger,
      latestLedger,
      satisfied: false,
      reasons: ["Current ledger number is unavailable, so ledger bounds cannot be confirmed."],
    };
  }

  let satisfied = true;
  if (earliestLedger !== null && currentLedger < earliestLedger) {
    satisfied = false;
    reasons.push(`Ledger ${currentLedger} is before minLedger ${earliestLedger}.`);
  }
  if (max && max > 0 && currentLedger >= max) {
    satisfied = false;
    reasons.push(`Ledger ${currentLedger} is not less than maxLedger ${max}.`);
  }

  return {
    rows: [
      {
        name: "ledgerBounds",
        present: true,
        value,
        status: satisfied ? "satisfied" : "unsatisfied",
        explanation: satisfied
          ? `Ledger ${currentLedger} falls inside the ledger bounds.`
          : reasons.join(" "),
      },
    ],
    earliestLedger,
    latestLedger,
    satisfied,
    reasons,
  };
}
