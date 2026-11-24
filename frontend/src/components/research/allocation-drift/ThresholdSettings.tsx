import type { AllocationReport } from '@/server/research/allocation-drift/schema';
export function ThresholdSettings({crossings}:{crossings:AllocationReport['crossings']}) {
  return <section className="space-y-2"><h2 className="text-lg font-semibold">Observed threshold crossings</h2>{crossings.length?<ul className="list-inside list-disc">{crossings.map((row,n)=><li key={`${row.at}:${row.key}:${n}`} className="break-all">{row.at}: {row.key} moved {row.direction} the absolute drift threshold ({row.driftBps} bps).</li>)}</ul>:<p>No crossing could be established between the available consecutive observations.</p>}</section>;
}
