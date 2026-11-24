import type { RunningEntry } from "./runningSupply";

export type CheckpointInput = {
  ledger: number;
  /** Network-reported outstanding supply in stroops at this ledger, when known. */
  networkStroops: bigint | null;
};

export type EvaluatedCheckpoint = {
  ledger: number;
  reconstructedStroops: bigint;
  networkStroops: bigint | null;
  deltaStroops: bigint | null;
  reconciled: boolean;
};

/**
 * At each checkpoint ledger, take the running supply after the last operation
 * at or before that ledger and compare it with the network-reported amount.
 */
export function evaluateCheckpoints(entries: RunningEntry[], opening: bigint, checkpoints: CheckpointInput[]): EvaluatedCheckpoint[] {
  return checkpoints.map((checkpoint) => {
    let reconstructed = opening;
    for (const entry of entries) {
      if (entry.ledger > checkpoint.ledger) break;
      reconstructed = entry.runningSupplyStroops;
    }
    const network = checkpoint.networkStroops;
    const delta = network === null ? null : network - reconstructed;
    return {
      ledger: checkpoint.ledger,
      reconstructedStroops: reconstructed,
      networkStroops: network,
      deltaStroops: delta,
      reconciled: delta === 0n,
    };
  });
}
