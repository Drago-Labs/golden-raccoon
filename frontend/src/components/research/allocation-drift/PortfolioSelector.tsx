'use client';
import { useState } from 'react';
export function PortfolioSelector({busy,onRead}:{busy:boolean;onRead:(wallet:string,network:string)=>void}) {
  const [wallet,setWallet]=useState(''),[network,setNetwork]=useState('ethereum');
  return <form onSubmit={e=>{e.preventDefault();onRead(wallet.trim(),network);}} className="flex flex-wrap items-end gap-3">
    <label className="flex min-w-0 flex-1 flex-col gap-1">Public portfolio wallet<input aria-label="Public portfolio wallet" required value={wallet} onChange={e=>setWallet(e.target.value)} className="rounded border bg-transparent p-2" autoComplete="off" spellCheck={false}/></label>
    <label className="flex flex-col gap-1">Network<select value={network} onChange={e=>setNetwork(e.target.value)} className="rounded border bg-background p-2">{['ethereum','base','goat','arbitrum','optimism','polygon','bsc','avalanche','stellar-testnet','stellar-pubnet'].map(id=><option key={id}>{id}</option>)}</select></label>
    <button disabled={busy} type="submit" className="rounded border px-4 py-2">{busy?'Reading…':'Read portfolio'}</button>
  </form>;
}
