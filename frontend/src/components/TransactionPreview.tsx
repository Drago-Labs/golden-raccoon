import type { TransactionPreview as Preview } from "@/server/types";
import { formatUsd } from "@/lib/format";

export function TransactionPreview({ preview }: { preview: Preview }) {
  return (
    <section className="rounded-[28px] border border-[#d9a441]/25 bg-[#d9a441]/8 p-6">
      <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Transaction preview</div>
      <h2 className="mt-3 text-2xl font-semibold">{preview.title}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-black/20 p-4">
          <div className="text-xs text-white/45">Estimated value</div>
          <div className="mt-1 text-xl font-semibold">{formatUsd(preview.estimatedValueUsd)}</div>
        </div>
        <div className="rounded-2xl bg-black/20 p-4">
          <div className="text-xs text-white/45">Risk reduction</div>
          <div className="mt-1 text-xl font-semibold">
            {preview.currentRiskScore} to {preview.projectedRiskScore}
          </div>
        </div>
      </div>
      {preview.blockedReason ? (
        <div className="mt-5 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {preview.blockedReason}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-black/20 px-4 py-3 text-sm text-white/56">
          {preview.requiresApproval ? "Approval required" : "No wallet approval required"} on {preview.network}
          {preview.percent ? ` · ${preview.percent}% ${preview.fromToken ?? "TOKEN"} to ${preview.toToken ?? "USDC"}` : null}
        </div>
      )}
      {preview.approvalSteps?.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {preview.approvalSteps.map((step) => (
            <div key={step} className="rounded-2xl bg-white/6 px-4 py-3 text-sm text-white/52">
              {step}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
