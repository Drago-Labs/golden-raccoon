'use client';
import { useState } from 'react';
import { PortfolioSelector } from './PortfolioSelector';
import { TargetEditor } from './TargetEditor';
import { DriftTable } from './DriftTable';
import { DriftHistoryChart } from './DriftHistoryChart';
import { ThresholdSettings } from './ThresholdSettings';
import { CoverageNotice } from './CoverageNotice';
import { useWorkbenchState } from './useWorkbenchState';

export function DriftTracker() {
  const work=useWorkbenchState();
  const [start,setStart]=useState(()=>new Date(Date.now()-30*86_400_000).toISOString().slice(0,16));
  const [end,setEnd]=useState(()=>new Date(Date.now()+60_000).toISOString().slice(0,16));
  const windowStart=start?`${start}:00.000Z`:'',windowEnd=end?`${end}:00.000Z`:'';
  const report=work.result?.report;
  return <div className="space-y-6"><h1 className="text-2xl font-semibold">Allocation drift tracker</h1>
    <p>Compare observed holdings with your own target. Restoration amounts are informational; this page never builds or submits a trade.</p>
    <PortfolioSelector busy={work.busy} onRead={(wallet,network)=>void work.read(wallet,network,windowStart,windowEnd)}/>
    <fieldset className="flex flex-wrap gap-3"><legend>History window (UTC, at most 90 days)</legend><label className="flex flex-col gap-1">From<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} className="rounded border bg-transparent p-2"/></label><label className="flex flex-col gap-1">Through<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} className="rounded border bg-transparent p-2"/></label></fieldset>
    <p role="status" aria-live="polite">{work.busy?'Reading portfolio evidence…':work.result?.state==='unavailable'?work.result.reason:report?`Calculation ${report.state}.`:work.result?.snapshot?'Portfolio read. Define a target to calculate drift.':'Choose a public wallet to begin.'}</p>
    {work.error?<p role="alert">{work.error}</p>:null}
    {work.result?.snapshot&&work.scope?<TargetEditor key={`${work.scope.network}:${work.scope.walletAddress}:${work.result.snapshot.at}`} snapshot={work.result.snapshot} initial={work.target} busy={work.busy} onAnalyze={(target,threshold)=>void work.read(work.scope!.walletAddress,work.scope!.network,windowStart,windowEnd,target,threshold)}/>:null}
    {report?<><h2 className="break-all text-lg font-semibold">{report.walletAddress} · {report.network}</h2><p>Observed priced value: ${report.totalUsd} · {report.current.at}</p><DriftTable rows={report.current.rows}/><DriftHistoryChart history={report.history}/><ThresholdSettings crossings={report.crossings}/><CoverageNotice notes={report.coverage}/></>:null}
  </div>;
}
