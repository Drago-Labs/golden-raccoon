import type { DriftPoint } from '@/server/research/allocation-drift/schema';
export function DriftHistoryChart({history}:{history:DriftPoint[]}) {
  const keys=[...new Map(history.flatMap(point=>point.rows.map(row=>[row.key,row.label] as const))).entries()];
  const colors=['#0891b2','#d97706','#8b5cf6','#16a34a'];
  return <section className="space-y-3" aria-label="Recorded drift history"><h2 className="text-lg font-semibold">Recorded drift history</h2>
    {history.length<2?<p>At least two priced observations are needed for a history.</p>:<svg viewBox="0 0 640 220" role="img" aria-labelledby="drift-chart-title" className="max-h-64 w-full"><title id="drift-chart-title">Absolute allocation drift over recorded observations; the data table below provides every value.</title><line x1="20" x2="620" y1="200" y2="200" stroke="currentColor"/>{keys.map(([key],index)=><polyline key={key} fill="none" stroke={colors[index%colors.length]} strokeWidth={2} points={history.flatMap((point,n)=>{const value=point.rows.find(row=>row.key===key)?.driftBps;if(value===null||value===undefined)return [];return [`${20+n*600/(history.length-1)},${200-Math.min(Math.abs(Number(value)),10_000)*180/10_000}`];}).join(' ')}/>)}</svg>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption>Text alternative: drift basis points at every recorded observation</caption><thead><tr><th scope="col">Observed at (UTC)</th>{keys.map(([key,label])=><th key={key} scope="col" className="p-2">{label}</th>)}</tr></thead><tbody>{history.map(point=><tr key={point.at}><th scope="row" className="p-2">{point.at}</th>{keys.map(([key])=><td key={key} className="p-2">{point.rows.find(row=>row.key===key)?.driftBps??'Unavailable'}</td>)}</tr>)}</tbody></table></div>
  </section>;
}
