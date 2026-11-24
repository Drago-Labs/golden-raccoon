import type { ClassifiedOperation } from "./classification";

export type RunningEntry = ClassifiedOperation & { runningSupplyStroops: bigint };

/**
 * Rebuild outstanding supply from classified mint/burn deltas.
 * Opening is the reconstructed supply just before the first in-window operation.
 */
export function applyRunningSupply(opening: bigint, operations: ClassifiedOperation[]): RunningEntry[] {
  let supply = opening;
  return operations.map((op) => {
    supply += op.deltaStroops;
    return { ...op, runningSupplyStroops: supply };
  });
}

export function finalSupply(opening: bigint, operations: ClassifiedOperation[]): bigint {
  return operations.reduce((supply, op) => supply + op.deltaStroops, opening);
}
