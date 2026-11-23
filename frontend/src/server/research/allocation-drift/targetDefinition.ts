import type { TargetDefinition } from './schema';
import { AllocationDriftError } from './errors';

export function percentToBasisPoints(value:string):number {
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) throw new AllocationDriftError('invalid_request','Target percentages support at most two decimal places.');
  const [whole,fraction='']=value.split('.');
  const bps=Number(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')));
  if(bps>10_000) throw new AllocationDriftError('invalid_request','A target cannot exceed 100%.');
  return bps;
}
export function defineTargets(mode:TargetDefinition['mode'], rows:Array<{key:string;label:string;percent:string;members:string[]}>):TargetDefinition {
  return {version:1,mode,entries:rows.map(row=>({key:row.key.trim(),label:row.label.trim(),basisPoints:percentToBasisPoints(row.percent),members:mode==='asset'?[row.key.trim()]:row.members}))};
}
