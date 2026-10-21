"use client";

import type { AmountReconciliation as AmountReconciliationData } from "@/server/research/cctp-transfers/schema";

export function AmountReconciliation({ reconciliation }: { reconciliation: AmountReconciliationData }) {
  return (
    <section data-testid="amount-reconciliation" className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-subtle sm:p-5">
      <h2 className="text-sm font-semibold text-muted">Amount reconciliation</h2>
      <p>
        Burned: <span className="font-mono">{reconciliation.grossAmountBaseUnits ?? "unknown"}</span> base units
      </p>
      <p>
        Destination fee: <span className="font-mono">{reconciliation.feeExecutedBaseUnits ?? "unknown"}</span> base units
      </p>
      <p>
        Net minted: <span className="font-mono">{reconciliation.netAmountBaseUnits ?? "unknown"}</span> base units
      </p>
      <p>{reconciliation.note}</p>
    </section>
  );
}
