/**
 * Operation-capacity of the ledgers that were actually read.
 *
 * `max_tx_set_size` is the denominator. A sequence that was not read is a
 * gap: it is listed, and it is left out of the mean. Treating a hole as an
 * empty ledger would make a quiet network look even quieter.
 */
import type { CapacityLedger, CapacitySummary, LedgerGap, ObservedLedger } from "./schema";

export function isLedgerFull(ledger: { operationCount: number; maxOperations: number }): boolean {
  return ledger.maxOperations > 0 && ledger.operationCount >= ledger.maxOperations;
}

export function usageBasisPoints(ledger: { operationCount: number; maxOperations: number }): number | null {
  if (ledger.maxOperations <= 0 || ledger.operationCount < 0) return null;

  return Number((BigInt(ledger.operationCount) * 10_000n) / BigInt(ledger.maxOperations));
}

export function findLedgerGaps(fromSequence: number, toSequence: number, present: readonly number[]): LedgerGap[] {
  const have = new Set(present);
  const gaps: LedgerGap[] = [];
  let runStart: number | null = null;

  for (let sequence = fromSequence; sequence <= toSequence; sequence += 1) {
    if (!have.has(sequence)) {
      runStart ??= sequence;
      continue;
    }

    if (runStart !== null) {
      gaps.push({ fromSequence: runStart, toSequence: sequence - 1, missingCount: sequence - runStart });
      runStart = null;
    }
  }

  if (runStart !== null) {
    gaps.push({ fromSequence: runStart, toSequence, missingCount: toSequence - runStart + 1 });
  }

  return gaps;
}

export function uniqueLedgers(ledgers: readonly ObservedLedger[]): ObservedLedger[] {
  const sorted = [...ledgers].sort((left, right) => left.sequence - right.sequence);
  const seen = new Set<number>();
  const unique: ObservedLedger[] = [];

  for (const ledger of sorted) {
    if (seen.has(ledger.sequence) || ledger.sequence < 1) continue;

    seen.add(ledger.sequence);
    unique.push(ledger);
  }

  return unique;
}

export function summarizeCapacity(ledgers: readonly ObservedLedger[], gaps: readonly LedgerGap[]): CapacitySummary {
  const points: CapacityLedger[] = ledgers.map((ledger) => ({
    sequence: ledger.sequence,
    closedAt: ledger.closedAt,
    operationCount: ledger.operationCount,
    maxOperations: ledger.maxOperations,
    usageBasisPoints: usageBasisPoints(ledger),
    full: isLedgerFull(ledger),
  }));

  const known = points.filter((point) => point.usageBasisPoints !== null);
  const total = known.reduce((sum, point) => sum + BigInt(point.usageBasisPoints ?? 0), 0n);

  return {
    ledgers: points,
    gaps: [...gaps],
    meanUsageBasisPoints: known.length === 0 ? null : Number(total / BigInt(known.length)),
    fullLedgerCount: points.filter((point) => point.full).length,
    presentLedgerCount: points.length,
  };
}
