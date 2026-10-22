"use client";
export function TokenInput({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm">Token contract<input aria-label="Token contract" required value={value} onChange={(event) => onChange(event.target.value)} placeholder="0x…" className="rounded-lg border border-white/15 bg-black/20 px-3 py-2" /></label>; }
