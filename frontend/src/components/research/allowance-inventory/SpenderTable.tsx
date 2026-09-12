import Link from "next/link";
import type { SpenderGroup } from "@/server/research/allowance-inventory/schema";
import { TokenExposurePanel } from "./TokenExposurePanel";

export function SpenderTable({ groups }: { groups: SpenderGroup[] }) {
  if (groups.length === 0) return <div className="rounded-2xl border border-white/10 p-5 text-sm text-white/55">No candidates were found in this bounded range or supplied explicitly.</div>;
  return (
    <section aria-labelledby="spender-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h2 id="spender-title" className="text-xl font-semibold">Spender exposure</h2><Link href="/recovery" className="text-sm text-[#f2c86d] underline">Review recovery options</Link></div>
      {groups.map((group) => (
        <details key={group.spender} open className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <summary className="cursor-pointer font-mono text-sm"><span className="break-all">{group.spender}</span> <span className="ml-2 text-white/45">{group.activeCount} active · {group.revokedCount} revoked</span></summary>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">{group.entries.map((entry) => <TokenExposurePanel key={`${entry.token}:${entry.spender}`} entry={entry} />)}</div>
        </details>
      ))}
    </section>
  );
}
