import { AllocationDriftError } from './errors';
import { snapshotSchema, type AllocationSnapshot, type TargetDefinition, type WeightedPosition } from './schema';

export const USD_SCALE=100_000_000n;
export function units(value:string):bigint {
  if(!/^\d{1,40}(?:\.\d{1,18})?$/.test(value)) throw new AllocationDriftError('malformed_snapshot','USD values must be nonnegative decimal strings.');
  const [whole,fraction='']=value.split('.');
  return BigInt(whole)*USD_SCALE+BigInt(fraction.slice(0,8).padEnd(8,'0'));
}
export function decimal(value:bigint,places=8):string {
  const scale=10n**BigInt(places),sign=value<0n?'-':'',absolute=value<0n?-value:value;
  const fraction=(absolute%scale).toString().padStart(places,'0').replace(/0+$/,'');
  return `${sign}${absolute/scale}${fraction?'.'+fraction:''}`;
}
export function normalizedPortfolio(raw:unknown,network:string,source='Saved portfolio capture'):AllocationSnapshot {
  const row=raw as Record<string,unknown>|null;
  if(!row||typeof row.walletAddress!=='string'||typeof row.createdAt!=='string'||!Array.isArray(row.holdings)) throw new AllocationDriftError('malformed_snapshot','Portfolio snapshot is missing wallet, observation time or holdings.');
  const provider=row.providerMeta as {network?:string}|undefined;
  if(provider?.network&&provider.network!==network) throw new AllocationDriftError('malformed_snapshot','Portfolio provider network does not match the request.');
  let complete=row.valuationStatus!=='partial'&&row.valuationStatus!=='unavailable';
  const holdings=row.holdings.map((value:unknown)=>{
    const holding=value as Record<string,unknown>;
    const address=typeof holding.tokenAddress==='string'?holding.tokenAddress:'';
    const chain=typeof holding.chainId==='string'?holding.chainId:network;
    const identity=address.startsWith('0x')?address.toLowerCase():address;
    if(!identity) throw new AllocationDriftError('malformed_snapshot','A holding has no asset identity.');
    const unpriced=holding.priceUsd===null||holding.priceStatus==='unavailable';
    if(unpriced) complete=false;
    if(typeof holding.valueUsd!=='number'||!Number.isFinite(holding.valueUsd)||holding.valueUsd<0) throw new AllocationDriftError('malformed_snapshot','A holding has an invalid USD value.');
    const price=typeof holding.priceUsd==='number'&&Number.isFinite(holding.priceUsd)&&holding.priceUsd>0?holding.priceUsd.toFixed(8):null;
    return {key:`${chain}:${identity}${typeof holding.issuer==='string'?':'+holding.issuer:''}`,label:String(holding.symbol??identity).slice(0,100),valueUsd:holding.valueUsd.toFixed(8),priceUsd:price};
  });
  return snapshotSchema.parse({walletAddress:row.walletAddress,network,at:row.createdAt,source,completeValuation:complete,holdings});
}
export function calculateWeights(snapshot:AllocationSnapshot,target:TargetDefinition):{total:bigint;positions:WeightedPosition[]} {
  const byKey=new Map<string,AllocationSnapshot['holdings'][number]>();
  for(const holding of snapshot.holdings) {
    if(byKey.has(holding.key)) throw new AllocationDriftError('malformed_snapshot','Duplicate asset identity in a snapshot.');
    byKey.set(holding.key,holding);
  }
  const total=snapshot.holdings.reduce((sum,h)=>sum+units(h.valueUsd),0n);
  const used=new Set(target.entries.flatMap(row=>row.members));
  const definitions=[...target.entries];
  if(target.mode==='asset') for(const holding of snapshot.holdings) {if(!used.has(holding.key)) definitions.push({key:holding.key,label:holding.label,basisPoints:0,members:[holding.key]});}
  else {
    const unallocated=snapshot.holdings.filter(h=>!used.has(h.key));
    if(unallocated.length) definitions.push({key:'__unallocated__',label:'Outside target groups',basisPoints:0,members:unallocated.map(h=>h.key)});
  }
  const positions=definitions.map(row=>{
    const valueUnits=row.members.reduce((sum,key)=>sum+units(byKey.get(key)?.valueUsd??'0'),0n);
    const bps=total>0n&&snapshot.completeValuation?decimal(valueUnits*1_000_000n/total,2):null;
    return {key:row.key,label:row.label,valueUnits,basisPoints:bps,targetBps:row.basisPoints,priceUsd:target.mode==='asset'?byKey.get(row.key)?.priceUsd??null:null};
  });
  return {total,positions};
}
