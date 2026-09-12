import Link from "next/link";
import type { TransactionRecord } from "@/server/types";
import { formatUsd } from "@/lib/format";

function shortHash(hash: string) {
  return `${hash.slice(0, 7)}...${hash.slice(-5)}`;
}

const statusTone: Record<TransactionRecord["lifecycleStatus"], string> = {
  prepared: "text-white/60", submitted: "text-sky-300", pending: "text-sky-300", confirming: "text-amber-300",
  confirmed: "text-emerald-300", failed: "text-rose-300", replaced: "text-amber-300", reorged: "text-rose-300",
  dropped: "text-rose-300", manual_review: "text-amber-300", expired: "text-white/50", user_rejected: "text-white/50",
};

export function RecentTransactions({ transactions }: { transactions: TransactionRecord[] }) {
  return (
    <section className="glass-panel rounded-[28px] p-6">
      <h2 className="text-xl font-semibold">Recent transactions</h2>
      <div className="mt-5 space-y-3">
        {transactions.map((transaction) => (
          <div key={transaction.hash} className="flex items-center justify-between gap-4 rounded-2xl bg-white/6 p-4">
            <div>
              <div className="text-sm font-medium capitalize">{transaction.type.replace("_", " ")}</div>
              <div className="mt-1 text-xs text-white/42">
                {shortHash(transaction.hash)} · {transaction.asset}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{transaction.valueUsd ? formatUsd(transaction.valueUsd) : "No value"}</div>
              <div className={`mt-1 text-xs capitalize ${statusTone[transaction.lifecycleStatus]}`}>{transaction.lifecycleStatus.replace("_", " ")}</div>
              {(transaction.lifecycleStatus === "confirming" || transaction.lifecycleStatus === "reorged" || transaction.lifecycleStatus === "manual_review") && (
                <div className="mt-1 max-w-56 text-[11px] text-white/45">
                  {transaction.lifecycleStatus === "confirming"
                    ? `${transaction.confirmationCount ?? 0}/${transaction.requiredConfirmations ?? 1} confirmations; funds are not final yet.`
                    : transaction.manualReviewReason ?? "Provider evidence changed; review before taking another action."}
                </div>
              )}
              {transaction.replacementHash && <div className="mt-1 text-[11px] text-amber-200">Replacement: {shortHash(transaction.replacementHash)}</div>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-white/54">
        <Link href="/insights/fee-analysis" className="underline underline-offset-2 hover:text-white">
          See what these transactions cost in network fees
        </Link>
      </p>
    </section>
  );
}
