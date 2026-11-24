import type { AllocationSnapshot, DriftPoint, TargetDefinition } from './schema';
import { calculateWeights, decimal } from './weights';
import { restoreAmounts } from './restoreAmounts';

export function driftPoint(snapshot:AllocationSnapshot,target:TargetDefinition):DriftPoint {
  const {total,positions}=calculateWeights(snapshot,target);
  return {at:snapshot.at,rows:positions.map(row=>({key:row.key,label:row.label,currentUsd:decimal(row.valueUnits),currentBps:row.basisPoints,targetBps:row.targetBps,
    driftBps:row.basisPoints===null?null:decimal(row.valueUnits*1_000_000n/total-BigInt(row.targetBps)*100n,2),
    ...restoreAmounts(total,row.valueUnits,row.targetBps,row.priceUsd,snapshot.completeValuation),
  }))};
}
