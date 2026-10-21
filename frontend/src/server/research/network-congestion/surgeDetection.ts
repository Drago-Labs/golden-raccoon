/**
 * Surge periods: runs of ledgers whose operation capacity was full.
 *
 * A missing sequence breaks the run. The inclusion floor is the lowest
 * per-operation inclusion fee in that run, computed separately for classic
 * and Soroban. Resource fees are not an input: they are not what surge
 * pricing ranks.
 */
import { isLedgerFull } from "./capacity";
import { inclusionFeePerOperation } from "./feePercentiles";
import type { ObservedLedger, ObservedTransaction, SurgePeriod } from "./schema";

function lowestInclusion(ledgers: readonly ObservedLedger[], kind: "classic" | "soroban"): bigint | null {
  let lowest: bigint | null = null;

  for (const ledger of ledgers) {
    for (const transaction of ledger.transactions) {
      const perOperation = inclusionOf(transaction, kind);

      if (perOperation === null) continue;
      if (lowest === null || perOperation < lowest) lowest = perOperation;
    }
  }

  return lowest;
}

function inclusionOf(transaction: ObservedTransaction, kind: "classic" | "soroban"): bigint | null {
  if (kind === "classic") {
    if (transaction.split !== "classic" || transaction.classicInclusionFeeStroops === null) return null;

    return inclusionFeePerOperation(transaction.classicInclusionFeeStroops, transaction.operationCount);
  }

  if (transaction.split !== "soroban" || transaction.sorobanInclusionFeeStroops === null) return null;

  return inclusionFeePerOperation(transaction.sorobanInclusionFeeStroops, transaction.operationCount);
}

function closePeriod(run: ObservedLedger[]): SurgePeriod {
  const classic = lowestInclusion(run, "classic");
  const soroban = lowestInclusion(run, "soroban");
  const baseFeeStroops = run.reduce((lowest, ledger) => Math.min(lowest, ledger.baseFeeStroops), run[0].baseFeeStroops);
  const base = BigInt(baseFeeStroops);

  return {
    fromSequence: run[0].sequence,
    toSequence: run[run.length - 1].sequence,
    ledgerCount: run.length,
    startedAt: run[0].closedAt,
    endedAt: run[run.length - 1].closedAt,
    baseFeeStroops,
    classicInclusionFloorStroops: classic === null ? null : classic.toString(),
    sorobanInclusionFloorStroops: soroban === null ? null : soroban.toString(),
    pricedAboveBase: (classic !== null && classic > base) || (soroban !== null && soroban > base),
  };
}

export function detectSurges(ledgers: readonly ObservedLedger[]): SurgePeriod[] {
  const full = [...ledgers].filter(isLedgerFull).sort((left, right) => left.sequence - right.sequence);
  const periods: SurgePeriod[] = [];
  let run: ObservedLedger[] = [];

  for (const ledger of full) {
    const previous = run[run.length - 1];

    if (previous && ledger.sequence !== previous.sequence + 1) {
      periods.push(closePeriod(run));
      run = [];
    }

    run.push(ledger);
  }

  if (run.length > 0) periods.push(closePeriod(run));

  return periods;
}
