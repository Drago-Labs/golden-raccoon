import type { RiskBreakdownItem } from "@/server/types";
import Link from "next/link";

function barColor(score: number) {
  if (score >= 85) return "bg-red-300";
  if (score >= 70) return "bg-orange-300";
  if (score >= 40) return "bg-[#d9a441]";
  return "bg-emerald-300";
}

export function RiskBreakdownCard({ items }: { items: RiskBreakdownItem[] }) {
  return (
    <section className="glass-panel rounded-[28px] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Why this is risky</h2>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        <Link href="/insights/proxy-inspector" className="inline-flex rounded-full border border-white/15 px-4 py-2 text-sm">Inspect proxy implementation</Link>
        {items.slice(0, 6).map((item) => (
          <div key={item.key}>
            <div className="mb-2 flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-white/78">{item.label}</span>
              <span className="text-white/54">{item.score}/100</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/8">
              <div className={`h-full rounded-full ${barColor(item.score)}`} style={{ width: `${item.score}%` }} />
            </div>
            <div className="mt-2 text-xs leading-5 text-white/42">{item.finding}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
