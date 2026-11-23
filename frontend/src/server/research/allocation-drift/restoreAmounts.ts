import { decimal, units } from './weights';

export function restoreAmounts(total:bigint,current:bigint,targetBps:number,price:string|null,known:boolean) {
  if(!known||total===0n) return {restoreUsd:null,restoreQuantity:null};
  const delta=total*BigInt(targetBps)/10_000n-current;
  const priceUnits=price?units(price):0n;
  return {restoreUsd:decimal(delta),restoreQuantity:priceUnits>0n?decimal(delta*10n**18n/priceUnits,18):null};
}
