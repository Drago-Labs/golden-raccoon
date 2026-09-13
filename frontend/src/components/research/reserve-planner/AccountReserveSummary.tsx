import type { ReserveBreakdown } from "@/server/research/reserve-planner/schema";

function xlm(stroops: string) {
  const value = BigInt(stroops); const whole = value / 10_000_000n; const fraction = (value % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

export function AccountReserveSummary({ breakdown, ledger, source }: { breakdown: ReserveBreakdown; ledger: number | null; source: string | null }) {
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-xs text-white/45">Total balance</div><div className="mt-1 text-2xl font-semibold">{xlm(breakdown.balanceStroops)} XLM</div></div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-xs text-white/45">Minimum reserve</div><div className="mt-1 text-2xl font-semibold">{xlm(breakdown.minimumReserveStroops)} XLM</div></div>
      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/7 p-4"><div className="text-xs text-white/45">Spendable after obligations</div><div className="mt-1 text-2xl font-semibold">{xlm(breakdown.spendableStroops)} XLM</div></div>
      <div className="sm:col-span-3 text-xs text-white/42">Observed at ledger {ledger ?? "unavailable"} via {source ?? "unavailable source"}.</div>
    </section>
  );
}
