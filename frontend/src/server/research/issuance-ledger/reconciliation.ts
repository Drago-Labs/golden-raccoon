import { ISSUANCE_LIMITS } from "./limits";
import type { EvaluatedCheckpoint } from "./checkpoints";
import type { RunningEntry } from "./runningSupply";
import type { LedgerOperation, UnreconciledGap } from "./schema";

function toLedgerOp(entry: RunningEntry): LedgerOperation {
  return {
    id: entry.id,
    ledger: entry.ledger,
    type: entry.type,
    kind: entry.kind,
    amountStroops: entry.deltaStroops.toString(),
    runningSupplyStroops: entry.runningSupplyStroops.toString(),
    from: entry.from,
    to: entry.to,
    transactionHash: entry.transactionHash,
    createdAt: entry.createdAt,
  };
}

/** Collect unreconciled checkpoints with surrounding ledger operations. */
export function collectUnreconciled(checkpoints: EvaluatedCheckpoint[], entries: RunningEntry[]): UnreconciledGap[] {
  const gaps: UnreconciledGap[] = [];
  for (const checkpoint of checkpoints) {
    if (checkpoint.reconciled || checkpoint.deltaStroops === null) continue;
    const index = entries.reduce((best, entry, i) => (entry.ledger <= checkpoint.ledger ? i : best), -1);
    const start = Math.max(0, index - ISSUANCE_LIMITS.surroundingOps);
    const end = Math.min(entries.length, Math.max(index + 1, 0) + ISSUANCE_LIMITS.surroundingOps);
    const surrounding = entries.slice(start, end).map(toLedgerOp);
    gaps.push({
      ledger: checkpoint.ledger,
      deltaStroops: checkpoint.deltaStroops.toString(),
      surrounding,
    });
  }
  return gaps;
}

/** True only when every checkpoint with a network figure matches and history is complete. */
export function claimReconciled(checkpoints: EvaluatedCheckpoint[], truncated: boolean, missingNetwork: boolean): boolean {
  if (truncated || missingNetwork || checkpoints.length === 0) return false;
  return checkpoints.every((checkpoint) => checkpoint.reconciled);
}
