import type { DecodedPreconditions } from "./envelopeDecode";
import type { PreconditionRow } from "./schema";

export type AccountSequenceState = {
  sequence: string | null;
  sequenceTimeUnix: number | null;
  sequenceLedger: number | null;
};

export type SequenceEvaluation = {
  rows: PreconditionRow[];
  earliestUnix: number | null;
  earliestLedger: number | null;
  satisfied: boolean;
  reasons: string[];
};

/**
 * Evaluate minAccountSequence, minAccountSequenceAge, and minAccountSequenceLedgerGap.
 *
 * CAP-21:
 * - minSeqNum <= account.sequence < tx.seqNum (when minSeqNum is set; otherwise account.sequence must be tx.seqNum - 1)
 * - closeTime >= account.seqTime + minSeqAge
 * - ledger >= account.seqLedger + minSeqLedgerGap
 */
export function evaluateSequenceRules(
  preconditions: DecodedPreconditions,
  txSequence: string,
  account: AccountSequenceState,
  closeTimeUnix: number | null,
  currentLedger: number | null,
): SequenceEvaluation {
  const rows: PreconditionRow[] = [];
  const reasons: string[] = [];
  let satisfied = true;
  let earliestUnix: number | null = null;
  let earliestLedger: number | null = null;

  const minSeq = preconditions.minAccountSequence;
  const minAge = preconditions.minAccountSequenceAge;
  const minGap = preconditions.minAccountSequenceLedgerGap;

  // --- minAccountSequence ---
  if (minSeq === null || minSeq === "0") {
    rows.push({
      name: "minAccountSequence",
      present: false,
      value: null,
      status: "not_set",
      explanation: `No minimum sequence is set. The source account sequence must equal tx.seqNum - 1 (${decrement(txSequence)}).`,
    });

    if (account.sequence !== null) {
      const expected = decrement(txSequence);
      if (account.sequence !== expected) {
        satisfied = false;
        reasons.push(
          `Source account sequence ${account.sequence} is not the required predecessor ${expected} of tx.seqNum ${txSequence}.`,
        );
        rows[rows.length - 1] = {
          name: "minAccountSequence",
          present: false,
          value: null,
          status: "unsatisfied",
          explanation: `Default sequence rule failed: account sequence ${account.sequence} must equal ${expected}.`,
        };
      } else {
        rows[rows.length - 1] = {
          name: "minAccountSequence",
          present: false,
          value: null,
          status: "satisfied",
          explanation: `Account sequence ${account.sequence} matches the required predecessor of tx.seqNum ${txSequence}.`,
        };
      }
    } else {
      rows[rows.length - 1] = {
        name: "minAccountSequence",
        present: false,
        value: null,
        status: "unknown",
        explanation: "Account sequence is unavailable, so the default predecessor rule cannot be confirmed.",
      };
      satisfied = false;
      reasons.push("Source account sequence is unavailable.");
    }
  } else {
    const value = minSeq;
    if (account.sequence === null) {
      rows.push({
        name: "minAccountSequence",
        present: true,
        value,
        status: "unknown",
        explanation: "minAccountSequence is set but the source account sequence is unavailable.",
      });
      satisfied = false;
      reasons.push("Source account sequence is unavailable for minAccountSequence.");
    } else {
      const accountSeq = BigInt(account.sequence);
      const min = BigInt(minSeq);
      const txSeq = BigInt(txSequence);
      const ok = accountSeq >= min && accountSeq < txSeq;
      if (!ok) {
        satisfied = false;
        reasons.push(
          `Account sequence ${account.sequence} is outside minAccountSequence ${minSeq} .. tx.seqNum ${txSequence} (exclusive).`,
        );
      }
      rows.push({
        name: "minAccountSequence",
        present: true,
        value,
        status: ok ? "satisfied" : "unsatisfied",
        explanation: ok
          ? `Account sequence ${account.sequence} satisfies minAccountSequence ${minSeq} <= n < ${txSequence}.`
          : `Account sequence ${account.sequence} does not satisfy minAccountSequence ${minSeq} <= n < ${txSequence}.`,
      });
    }
  }

  // --- minAccountSequenceAge ---
  const ageSet = minAge !== null && minAge !== "0";
  if (!ageSet) {
    rows.push({
      name: "minAccountSequenceAge",
      present: false,
      value: null,
      status: "not_set",
      explanation: "No minimum sequence age is set.",
    });
  } else if (account.sequenceTimeUnix === null || closeTimeUnix === null) {
    rows.push({
      name: "minAccountSequenceAge",
      present: true,
      value: `${minAge}s`,
      status: "unknown",
      explanation: "minAccountSequenceAge is set but sequence time or close time is unavailable.",
    });
    satisfied = false;
    reasons.push("Sequence age cannot be confirmed without sequence time and close time.");
  } else {
    const required = account.sequenceTimeUnix + Number(minAge);
    earliestUnix = required;
    const ok = closeTimeUnix >= required;
    if (!ok) {
      satisfied = false;
      reasons.push(
        `Close time ${closeTimeUnix} is earlier than sequence time ${account.sequenceTimeUnix} + minAge ${minAge}.`,
      );
    }
    rows.push({
      name: "minAccountSequenceAge",
      present: true,
      value: `${minAge}s`,
      status: ok ? "satisfied" : "unsatisfied",
      explanation: ok
        ? `Sequence age is at least ${minAge}s.`
        : `Sequence age is below ${minAge}s; earliest valid close time is ${required}.`,
    });
  }

  // --- minAccountSequenceLedgerGap ---
  const gapSet = minGap !== null && minGap > 0;
  if (!gapSet) {
    rows.push({
      name: "minAccountSequenceLedgerGap",
      present: false,
      value: null,
      status: "not_set",
      explanation: "No minimum sequence ledger gap is set.",
    });
  } else if (account.sequenceLedger === null || currentLedger === null) {
    rows.push({
      name: "minAccountSequenceLedgerGap",
      present: true,
      value: String(minGap),
      status: "unknown",
      explanation: "minAccountSequenceLedgerGap is set but sequence ledger or current ledger is unavailable.",
    });
    satisfied = false;
    reasons.push("Sequence ledger gap cannot be confirmed without sequence ledger and current ledger.");
  } else {
    const required = account.sequenceLedger + minGap;
    earliestLedger = required;
    const ok = currentLedger >= required;
    if (!ok) {
      satisfied = false;
      reasons.push(
        `Ledger ${currentLedger} is earlier than sequence ledger ${account.sequenceLedger} + gap ${minGap}.`,
      );
    }
    rows.push({
      name: "minAccountSequenceLedgerGap",
      present: true,
      value: String(minGap),
      status: ok ? "satisfied" : "unsatisfied",
      explanation: ok
        ? `Sequence ledger gap is at least ${minGap}.`
        : `Sequence ledger gap is below ${minGap}; earliest valid ledger is ${required}.`,
    });
  }

  return { rows, earliestUnix, earliestLedger, satisfied, reasons };
}

function decrement(sequence: string): string {
  try {
    return (BigInt(sequence) - 1n).toString();
  } catch {
    return sequence;
  }
}
