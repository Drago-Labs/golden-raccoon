import type { AllocationSnapshot, TargetDefinition } from './schema';
import { snapshotSchema } from './schema';
import { validateTargets } from './targetValidation';
import { ALLOCATION_LIMITS } from './limits';

type PreferenceStorage=Pick<Storage,'getItem'|'setItem'>;
/** EVM addresses are case-insensitive hex; Stellar StrKey addresses are not. */
export function walletScope(wallet:string,network:string) {
  return `${network}:${/^0[xX]/.test(wallet)?wallet.toLowerCase():wallet}`;
}
export function preferenceKey(wallet:string,network:string) {return `golden-raccoon:allocation-targets:v1:${walletScope(wallet,network)}`;}
export function loadTargets(storage:PreferenceStorage,wallet:string,network:string):{targets:TargetDefinition|null;history:AllocationSnapshot[]} {
  try {
    const text=storage.getItem(preferenceKey(wallet,network));
    if(!text||text.length>ALLOCATION_LIMITS.maxRequestBytes) return {targets:null,history:[]};
    const value=JSON.parse(text);
    if(value.version!==1||value.scope!==walletScope(wallet,network)) return {targets:null,history:[]};
    const targets=value.targets?validateTargets(value.targets):null;
    const history=Array.isArray(value.history)?value.history.slice(-ALLOCATION_LIMITS.maxSnapshots).flatMap((row:unknown)=>{
      const parsed=snapshotSchema.safeParse(row);
      return parsed.success&&walletScope(parsed.data.walletAddress,parsed.data.network)===walletScope(wallet,network)?[parsed.data]:[];
    }):[];
    return {targets,history};
  } catch {return {targets:null,history:[]};}
}
export function saveTargets(storage:PreferenceStorage,wallet:string,network:string,targets:TargetDefinition|null,history:AllocationSnapshot[]) {
  const own=history.filter(row=>walletScope(row.walletAddress,row.network)===walletScope(wallet,network));
  const unique=[...new Map(own.map(row=>[row.at,row])).values()].sort((a,b)=>a.at.localeCompare(b.at)).slice(-ALLOCATION_LIMITS.maxSnapshots);
  const text=JSON.stringify({version:1,scope:walletScope(wallet,network),targets:targets?validateTargets(targets):null,history:unique});
  if(text.length>ALLOCATION_LIMITS.maxRequestBytes) throw new Error('Saved allocation history exceeds the local preference limit. Narrow the history.');
  storage.setItem(preferenceKey(wallet,network),text);
}
