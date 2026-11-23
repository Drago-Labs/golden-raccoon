import { AllocationDriftError } from './errors';
import { targetSchema, type TargetDefinition } from './schema';

export function validateTargets(value:unknown):TargetDefinition {
  const parsed=targetSchema.safeParse(value);
  if(!parsed.success) throw new AllocationDriftError('invalid_request','Target allocation is malformed.');
  const target=parsed.data;
  if(target.entries.reduce((sum,row)=>sum+row.basisPoints,0)!==10_000) throw new AllocationDriftError('invalid_request','Target allocations must sum to exactly 100%.');
  const keys=new Set<string>(),members=new Set<string>();
  for(const row of target.entries) {
    if(row.key==='__unallocated__'||keys.has(row.key)) throw new AllocationDriftError('invalid_request','Target keys must be unique.');
    keys.add(row.key);
    if(target.mode==='asset'&&(row.members.length!==1||row.members[0]!==row.key)) throw new AllocationDriftError('invalid_request','An asset target must refer to its own asset identity.');
    for(const member of row.members) {
      if(members.has(member)) throw new AllocationDriftError('invalid_request','An asset cannot belong to more than one target or group.');
      members.add(member);
    }
  }
  return target;
}
