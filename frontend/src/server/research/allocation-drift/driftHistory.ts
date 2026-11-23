import type { AllocationSnapshot, TargetDefinition } from './schema';
import { driftPoint } from './drift';
import { walletScope } from './targetStorage';
import { AllocationDriftError } from './errors';

export function driftHistory(snapshots:AllocationSnapshot[],target:TargetDefinition,scope:{walletAddress:string;network:string},start:string,end:string) {
  const rows=new Map<string,AllocationSnapshot>();
  for(const snapshot of snapshots) {
    if(walletScope(snapshot.walletAddress,snapshot.network)!==walletScope(scope.walletAddress,scope.network)) continue;
    if(snapshot.at<start||snapshot.at>end) continue;
    const previous=rows.get(snapshot.at);
    if(previous&&JSON.stringify(previous.holdings)!==JSON.stringify(snapshot.holdings)) throw new AllocationDriftError('malformed_snapshot','Two incompatible snapshots claim the same observation time.');
    rows.set(snapshot.at,snapshot);
  }
  return [...rows.values()].sort((a,b)=>a.at.localeCompare(b.at)).map(row=>driftPoint(row,target));
}
