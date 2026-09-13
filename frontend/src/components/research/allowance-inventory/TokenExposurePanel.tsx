import { formatTokenInteger } from "@/server/research/allowance-inventory/exposure";
import type { InventoryEntry } from "@/server/research/allowance-inventory/schema";

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export function TokenExposurePanel({ entry }: { entry: InventoryEntry }) {
  return (
    <article className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><strong>{entry.symbol ?? "Unknown token"}</strong><div className="font-mono text-xs text-white/42">{short(entry.token)}</div></div>
        <span className={`rounded-full px-2 py-1 text-xs ${entry.allowanceKind === "revoked" ? "bg-emerald-500/15 text-emerald-200" : entry.allowanceKind === "maximum" ? "bg-red-500/15 text-red-100" : "bg-white/10 text-white/70"}`}>{entry.allowanceKind}</span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-white/42">Current allowance</dt><dd className="break-all font-mono">{entry.allowance ?? "Unknown"}</dd></div>
        <div><dt className="text-white/42">Known balance exposure</dt><dd>{formatTokenInteger(entry.knownBalanceExposure, entry.decimals)} {entry.symbol ?? "units"}</dd></div>
      </dl>
      <div className="mt-2 text-xs text-white/40">Candidate source: {entry.source}. Balance and allowance were read at the displayed snapshot.</div>
      {entry.warnings.length ? <ul className="mt-2 list-disc pl-5 text-xs text-amber-100/75">{entry.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
    </article>
  );
}
