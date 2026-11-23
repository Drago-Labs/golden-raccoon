import type { AllocationSnapshot } from './schema';

export function allocationCoverage(current:AllocationSnapshot,historyCount:number,firstAt:string|undefined,start:string) {
  const notes=['Weights use USD market values, not token quantities. Amounts retain eight decimal places; basis points are truncated to two decimals.','History uses recorded observations only, recalculated against the selected target version. No values between observations are inferred.'];
  let partial=false;
  if(!current.completeValuation) {partial=true;notes.push('Some holdings have no usable price. Weights, drift and restoration amounts are unavailable rather than treating those holdings as zero.');}
  if(historyCount<2) {partial=true;notes.push('Fewer than two usable observations: drift history and threshold crossings are incomplete.');}
  if(!firstAt||Date.parse(firstAt)>Date.parse(start)) {partial=true;notes.push('The saved observations do not cover the beginning of the selected window.');}
  return {partial,notes};
}
