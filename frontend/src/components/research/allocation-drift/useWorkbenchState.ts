'use client';
import { useEffect, useRef, useState } from 'react';
import { readOfflineState } from '@/lib/offlineStore';
import { normalizedPortfolio } from '@/server/research/allocation-drift/weights';
import { loadTargets, saveTargets } from '@/server/research/allocation-drift/targetStorage';
import type { AllocationResult, AllocationSnapshot, TargetDefinition } from '@/server/research/allocation-drift/schema';

export function useWorkbenchState() {
  const [result,setResult]=useState<AllocationResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [scope,setScope]=useState<{walletAddress:string;network:string}|null>(null),[target,setTarget]=useState<TargetDefinition|null>(null);
  const history=useRef<AllocationSnapshot[]>([]),pending=useRef<AbortController|null>(null),sequence=useRef(0);
  useEffect(()=>()=>pending.current?.abort(),[]);

  async function read(walletAddress:string,network:string,windowStart:string,windowEnd:string,targets?:TargetDefinition,thresholdBps=500) {
    pending.current?.abort();const controller=new AbortController();pending.current=controller;
    const request=++sequence.current;setBusy(true);setError('');
    let prior=history.current;
    if(!scope||scope.walletAddress!==walletAddress||scope.network!==network||!targets) {
      setResult(null);setScope({walletAddress,network});
      const saved=loadTargets(window.localStorage,walletAddress,network);
      prior=[...saved.history];setTarget(saved.targets);
      for(const capture of readOfflineState().portfolios) {
        if(capture.data.walletAddress!==walletAddress)continue;
        try {prior.push(normalizedPortfolio(capture.data,network,capture.source));}catch{/* An incompatible offline capture is not portfolio evidence for this network. */}
      }
    }
    try {
      const response=await fetch('/api/insights/allocation-drift',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({walletAddress,network,windowStart,windowEnd,targets,thresholdBps,history:prior.slice(-80)}),signal:controller.signal});
      const value=await response.json();
      if(sequence.current!==request)return;
      if(!response.ok&&value.state!=='unavailable')throw new Error(value.message??'Allocation request failed.');
      setResult(value as AllocationResult);
      if(value.snapshot) {
        history.current=[...new Map([...prior,value.snapshot].map(row=>[row.at,row])).values()].sort((a,b)=>a.at.localeCompare(b.at)).slice(-80);
        const next=targets??loadTargets(window.localStorage,walletAddress,network).targets;
        setTarget(next);
        try {saveTargets(window.localStorage,walletAddress,network,next,history.current);}catch{setError('The calculation is available, but local preference storage could not save it.');}
      }
    } catch(e) {if(!controller.signal.aborted&&sequence.current===request)setError(e instanceof Error?e.message:'Portfolio read failed.');}
    finally {if(sequence.current===request)setBusy(false);}
  }
  return {result,busy,error,scope,target,read};
}
