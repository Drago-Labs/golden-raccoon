import type { ReserveBreakdown } from "@/server/research/reserve-planner/schema";

const rows: [keyof ReserveBreakdown, string][] = [["minimumReserveStroops", "Minimum reserve"], ["sellingLiabilitiesStroops", "Selling liabilities"], ["feeAllowanceStroops", "Fee allowance"], ["spendableStroops", "Spendable"], ["shortfallStroops", "Shortfall"]];
const xlm = (value: string) => (Number(value) / 10_000_000).toLocaleString("en-US", { maximumFractionDigits: 7 });

export function ObligationTable({ before, after }: { before: ReserveBreakdown; after: ReserveBreakdown }) {
  return (
    <section aria-labelledby="obligations-title" className="overflow-x-auto rounded-2xl border border-white/10 p-5"><h2 id="obligations-title" className="text-lg font-semibold">Before and after obligations</h2><table className="mt-4 w-full min-w-[520px] text-left text-sm"><thead className="text-white/45"><tr><th className="pb-2">Category</th><th className="pb-2">Before (XLM)</th><th className="pb-2">After (XLM)</th></tr></thead><tbody>{rows.map(([key, label]) => <tr key={key} className="border-t border-white/8"><th className="py-3 font-medium">{label}</th><td className="font-mono">{xlm(before[key])}</td><td className="font-mono">{xlm(after[key])}</td></tr>)}</tbody></table></section>
  );
}
