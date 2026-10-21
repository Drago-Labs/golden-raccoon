import type { AssetReconciliation } from "@/server/research/balance-reconciliation/schema";

export function ReconciliationResult({ rows, matched }: { rows: AssetReconciliation[]; matched: boolean }) {
  return (
    <section data-testid="reconciliation-result" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">{matched ? "Matched to the stroop" : "Unexplained delta"}</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.asset}>
            {row.asset}: delta {row.deltaStroops ?? "unavailable"} stroops
          </li>
        ))}
      </ul>
    </section>
  );
}
