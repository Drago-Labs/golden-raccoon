'use client';
import { useState } from 'react';
import type { AllocationSnapshot, TargetDefinition } from '@/server/research/allocation-drift/schema';
import { defineTargets, percentToBasisPoints } from '@/server/research/allocation-drift/targetDefinition';
import { validateTargets } from '@/server/research/allocation-drift/targetValidation';

export function TargetEditor({snapshot,initial,busy,onAnalyze}:{snapshot:AllocationSnapshot;initial:TargetDefinition|null;busy:boolean;onAnalyze:(target:TargetDefinition,threshold:number)=>void}) {
  const [mode,setMode]=useState<TargetDefinition['mode']>(initial?.mode??'asset');
  const [rows,setRows]=useState(initial?.entries.map(row=>({key:row.key,label:row.label,percent:String(row.basisPoints/100),members:row.members}))??snapshot.holdings.map(h=>({key:h.key,label:h.label,percent:'0',members:[h.key]})));
  const [threshold,setThreshold]=useState('5'),[error,setError]=useState('');
  function update(index:number,change:Partial<(typeof rows)[number]>) {setRows(previous=>previous.map((row,n)=>n===index?{...row,...change}:row));}
  return <form className="space-y-3 rounded border p-4" onSubmit={event=>{event.preventDefault();setError('');try {const target=validateTargets(defineTargets(mode,rows));const limit=percentToBasisPoints(threshold);if(limit===0)throw new Error('Choose a positive threshold.');onAnalyze(target,limit);}catch(e){setError(e instanceof Error?e.message:'Invalid target.');}}}>
    <h2 className="text-lg font-semibold">Your target allocation</h2>
    <label className="flex flex-col gap-1">Target by<select value={mode} onChange={e=>{const next=e.target.value as TargetDefinition['mode'];setMode(next);setRows(next==='asset'?snapshot.holdings.map(h=>({key:h.key,label:h.label,percent:'0',members:[h.key]})):[]);}} className="rounded border bg-background p-2"><option value="asset">Asset</option><option value="group">Custom group</option></select></label>
    {rows.map((row,index)=><fieldset key={`${mode}:${row.key}`} className="flex flex-wrap items-start gap-3 rounded border p-3">
      <legend className="break-all px-1">{row.label}</legend>
      {mode==='group'?<><label className="flex flex-col gap-1">Group name<input value={row.label} onChange={e=>update(index,{label:e.target.value})} className="rounded border bg-transparent p-2" required maxLength={100}/></label><label className="flex min-w-0 flex-1 flex-col gap-1">Group assets<select multiple value={row.members} onChange={e=>update(index,{members:[...e.target.selectedOptions].map(option=>option.value)})} className="min-w-0 rounded border bg-background p-2">{snapshot.holdings.map(h=><option key={h.key} value={h.key}>{h.label} · {h.key}</option>)}</select></label></>:<p className="min-w-0 flex-1 break-all text-xs">{row.key}</p>}
      <label className="flex flex-col gap-1">Target %<input type="number" min="0" max="100" step="0.01" required value={row.percent} onChange={e=>update(index,{percent:e.target.value})} className="w-24 rounded border bg-transparent p-2"/></label>
      {mode==='group'?<button type="button" onClick={()=>setRows(previous=>previous.filter((_,n)=>n!==index))} className="rounded border p-2">Remove group</button>:null}
    </fieldset>)}
    {mode==='group'?<button type="button" onClick={()=>setRows(previous=>[...previous,{key:`group:${Date.now()}:${previous.length}`,label:`Group ${previous.length+1}`,percent:'0',members:[]}])} className="rounded border p-2">Add group</button>:null}
    <label className="flex flex-col gap-1">Drift threshold (%)<input type="number" min="0.01" max="100" step="0.01" value={threshold} onChange={e=>setThreshold(e.target.value)} className="w-28 rounded border bg-transparent p-2" required/></label>
    <p className="text-sm">Targets must total exactly 100%. Positive restoration amounts mean adding value; negative amounts mean reducing value. No transaction is built.</p>
    {error?<p role="alert">{error}</p>:null}
    <button type="submit" disabled={busy} className="rounded border px-4 py-2">{busy?'Calculating…':'Save target and calculate drift'}</button>
  </form>;
}
