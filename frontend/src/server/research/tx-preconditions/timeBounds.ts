import type { DecodedPreconditions } from "./envelopeDecode";
import type { PreconditionRow } from "./schema";

export type TimeBoundsEvaluation = {
  rows: PreconditionRow[];
  earliestUnix: number | null;
  latestUnix: number | null;
  satisfied: boolean;
  reasons: string[];
};

/**
 * Evaluate CAP-21 / classic time bounds against a ledger close time.
 * minTime or maxTime of 0 means unbounded on that side.
 */
export function evaluateTimeBounds(
  preconditions: DecodedPreconditions,
  closeTimeUnix: number | null,
): TimeBoundsEvaluation {
  const min = preconditions.minTime;
  const max = preconditions.maxTime;
  const present = (min !== null && min !== "0") || (max !== null && max !== "0");
  const reasons: string[] = [];
  const earliestUnix = min && min !== "0" ? Number(min) : null;
  const latestUnix = max && max !== "0" ? Number(max) : null;

  let satisfied = true;

  if (!present) {
    return {
      rows: [
        {
          name: "timeBounds",
          present: false,
          value: null,
          status: "not_set",
          explanation: "No time bounds are set. The envelope is not restricted by ledger close time.",
        },
      ],
      earliestUnix: null,
      latestUnix: null,
      satisfied: true,
      reasons: [],
    };
  }

  const value = `minTime=${min ?? "0"}, maxTime=${max ?? "0"}`;

  if (closeTimeUnix === null) {
    return {
      rows: [
        {
          name: "timeBounds",
          present: true,
          value,
          status: "unknown",
          explanation: "Time bounds are present but the current ledger close time is unavailable.",
        },
      ],
      earliestUnix,
      latestUnix,
      satisfied: false,
      reasons: ["Ledger close time is unavailable, so time bounds cannot be confirmed."],
    };
  }

  if (earliestUnix !== null && closeTimeUnix < earliestUnix) {
    satisfied = false;
    reasons.push(`Close time ${closeTimeUnix} is before minTime ${earliestUnix}.`);
  }
  if (latestUnix !== null && closeTimeUnix > latestUnix) {
    satisfied = false;
    reasons.push(`Close time ${closeTimeUnix} is after maxTime ${latestUnix}.`);
  }

  return {
    rows: [
      {
        name: "timeBounds",
        present: true,
        value,
        status: satisfied ? "satisfied" : "unsatisfied",
        explanation: satisfied
          ? `Ledger close time ${closeTimeUnix} falls inside the time bounds.`
          : reasons.join(" "),
      },
    ],
    earliestUnix,
    latestUnix,
    satisfied,
    reasons,
  };
}
