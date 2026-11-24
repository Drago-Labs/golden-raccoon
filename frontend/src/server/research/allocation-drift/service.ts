import { allocationRequestSchema, type AllocationResult, type AllocationSnapshot } from './schema';
import { AllocationDriftError } from './errors';
import { validateTargets } from './targetValidation';
import { normalizedPortfolio, calculateWeights, decimal } from './weights';
import { driftPoint } from './drift';
import { driftHistory } from './driftHistory';
import { thresholdCrossings } from './thresholds';
import { allocationCoverage } from './coverage';
import { walletScope } from './targetStorage';

export type AllocationDeps={readPortfolio:(wallet:string,network:string)=>Promise<AllocationSnapshot>};
const production:AllocationDeps={readPortfolio:async(wallet,network)=>{
  const {getPortfolioSnapshot}=await import('@/server/portfolio/getPortfolio');
  const result=await getPortfolioSnapshot(wallet,network);
  if(result.source.status!=='connected') throw new AllocationDriftError('unavailable','The configured portfolio provider returned no usable portfolio.');
  return normalizedPortfolio(result.portfolio,network,'Live portfolio read API');
}};
export async function inspectAllocationDrift(input:unknown,deps:AllocationDeps=production):Promise<AllocationResult> {
  const parsed=allocationRequestSchema.safeParse(input);
  if(!parsed.success) throw new AllocationDriftError('invalid_request','Choose a matching public wallet/network and a window of at most 90 days.');
  const request=parsed.data,target=request.targets?validateTargets(request.targets):null;
  let snapshot:AllocationSnapshot;
  try {snapshot=await deps.readPortfolio(request.walletAddress,request.network);}
  catch(error) {if(error instanceof AllocationDriftError&&error.code==='malformed_snapshot') throw error;return {state:'unavailable',snapshot:null,report:null,reason:'Portfolio provider unavailable. No holdings or prices were fabricated.'};}
  if(walletScope(snapshot.walletAddress,snapshot.network)!==walletScope(request.walletAddress,request.network)) throw new AllocationDriftError('malformed_snapshot','The read API returned a different portfolio identity.');
  if(!target) return {state:'ready',snapshot,report:null};
  const current=driftPoint(snapshot,target);
  const history=driftHistory([...request.history,snapshot],target,request,request.windowStart,request.windowEnd);
  const coverage=allocationCoverage(snapshot,history.length,history[0]?.at,request.windowStart);
  return {state:'ready',snapshot,report:{state:coverage.partial?'partial':'complete',walletAddress:request.walletAddress,network:request.network,target,current,history,
    crossings:thresholdCrossings(history,request.thresholdBps),totalUsd:decimal(calculateWeights(snapshot,target).total),coverage:coverage.notes}};
}
