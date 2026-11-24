import type { AllocationReport, DriftPoint } from './schema';

function hundredths(value:string) {const [whole,fraction='']=value.replace('-','').split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));}
export function thresholdCrossings(points:DriftPoint[],thresholdBps:number):AllocationReport['crossings'] {
  const crossings:AllocationReport['crossings']=[];
  for(let index=1;index<points.length;index++) {
    const before=new Map(points[index-1].rows.map(row=>[row.key,row.driftBps]));
    for(const row of points[index].rows) {
      const previous=before.get(row.key);
      if(previous===undefined||previous===null||row.driftBps===null) continue;
      const wasAbove=hundredths(previous)>BigInt(thresholdBps)*100n,nowAbove=hundredths(row.driftBps)>BigInt(thresholdBps)*100n;
      if(wasAbove!==nowAbove) crossings.push({at:points[index].at,key:row.key,direction:nowAbove?'above':'below',driftBps:row.driftBps});
    }
  }
  return crossings;
}
