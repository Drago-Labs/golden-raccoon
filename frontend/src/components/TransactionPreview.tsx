import type { TransactionPreview as Preview, EvmTransactionPayload, StellarTransactionPayload } from "@/server/types";
import { formatUsd } from "@/lib/format";

function PayloadDetails({ payload }: { payload: Preview["payload"] }) {
  if (!payload) return null;

  if (payload.chainFamily === "evm") {
    return <EvmPayloadSection payload={payload} />;
  }

  return <StellarPayloadSection payload={payload} />;
}

function EvmPayloadSection({ payload }: { payload: EvmTransactionPayload }) {
  return (
    <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.12em] text-white/35">EVM Transaction</div>
      <div className="grid gap-2 text-xs">
        <Row label="Contract" mono value={payload.txRequest.to} />
        <Row label="From" mono value={payload.txRequest.from} />
        {payload.txRequest.value && payload.txRequest.value !== "0x0" ? (
          <Row label="Native value" mono value={`${BigInt(payload.txRequest.value).toString()} wei`} />
        ) : null}
        <Row label="Calldata" mono value={`${payload.txRequest.data.slice(0, 42)}…`} />
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-[10px] uppercase tracking-[0.12em] text-white/35 hover:text-white/55">
          Full calldata
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/50">
          {payload.txRequest.data}
        </pre>
      </details>
    </div>
  );
}

function StellarPayloadSection({ payload }: { payload: StellarTransactionPayload }) {
  return (
    <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.12em] text-white/35">Stellar Transaction</div>
      <div className="grid gap-2 text-xs">
        <Row label="Source" mono value={payload.sourceAccount} />
        <Row label="Network" value={payload.network} />
        {payload.resourceFee ? <Row label="Resource fee" mono value={`${payload.resourceFee} stroops`} /> : null}
      </div>
      {payload.operations.length > 0 ? (
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-white/35">Operations</div>
          <div className="space-y-1.5">
            {payload.operations.map((op, index) => (
              <div key={index} className="rounded-lg bg-black/30 px-3 py-2 text-[11px] text-white/50">
                <span className="font-semibold text-white/60">{op.type}</span>
                {op.asset ? ` ${op.asset}` : null}
                {op.amount ? ` · ${op.amount}` : null}
                {op.destination ? ` → ${op.destination}` : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <details className="mt-2">
        <summary className="cursor-pointer text-[10px] uppercase tracking-[0.12em] text-white/35 hover:text-white/55">
          Raw XDR
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-white/50">
          {payload.transactionXdr}
        </pre>
      </details>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-white/35">{label}</span>
      <span className={`truncate text-right ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}

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
          {preview.chainFamily ? ` · ${preview.chainFamily.toUpperCase()}` : null}
          {preview.percent ? ` · ${preview.percent}% ${preview.fromToken ?? "TOKEN"} to ${preview.toToken ?? "USDC"}` : null}
        </div>
      )}

      {/* ─── Payload details (chain‑family specific) ─── */}
      {preview.payload && preview.requiresApproval && <PayloadDetails payload={preview.payload} />}

      {/* ─── Minimum output & slippage ─── */}
      {preview.payload && preview.requiresApproval ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-xs text-white/38">Minimum output (after slippage)</div>
            <div className="mt-1 text-sm font-semibold">{preview.payload.minOutputAmount ?? "—"} {preview.payload.toToken ?? preview.payload.toAsset}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-xs text-white/38">Slippage tolerance</div>
            <div className="mt-1 text-sm font-semibold">{(preview.payload.slippageBps / 100).toFixed(2)}%</div>
          </div>
        </div>
      ) : null}

      {/* ─── Expiry ─── */}
      {preview.lifecycle?.expiresAt ? (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-xs text-white/45">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${Date.now() > new Date(preview.lifecycle.expiresAt).getTime() ? "bg-red-400" : "bg-emerald-400"}`} />
          {Date.now() > new Date(preview.lifecycle.expiresAt).getTime()
            ? "Expired — re-run the analysis for a fresh plan."
            : `Expires in ${Math.max(0, Math.floor((new Date(preview.lifecycle.expiresAt).getTime() - Date.now()) / 60_000))} min`}
        </div>
      ) : null}

      {preview.approvalSteps?.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {preview.approvalSteps.map((step) => (
            <div key={step} className="rounded-2xl bg-white/6 px-4 py-3 text-sm text-white/52">
              {step}
            </div>
          ))}
        </div>
      ) : null}

      {preview.policy ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-xs text-white/38">Max trade</div>
            <div className="mt-1 text-sm font-semibold">{preview.policy.maxTradePercent}%</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-xs text-white/38">Risk threshold</div>
            <div className="mt-1 text-sm font-semibold">{preview.policy.maxRiskScore}/100</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-xs text-white/38">Auto execute</div>
            <div className="mt-1 text-sm font-semibold">{preview.policy.autoExecute ? "On" : "Off"}</div>
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs text-white/38">Policy</div>
          <div className="mt-1 text-sm font-semibold">{preview.policyStatus?.allowed ? "Allowed" : preview.blockedReason ? "Blocked" : "Review"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs text-white/38">Simulation</div>
          <div className="mt-1 text-sm font-semibold">{preview.simulation?.status?.replaceAll("_", " ") ?? "Unavailable"}</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="text-xs text-white/38">Slippage / gas</div>
          <div className="mt-1 text-sm font-semibold">
            {preview.slippageBps ?? 0} bps · {formatUsd(preview.gasEstimateUsd ?? 0)}
          </div>
        </div>
      </div>

      {preview.quote ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/48">
          Route: {preview.quote.route.join(" -> ")} · Price impact {preview.quote.priceImpactBps} bps. {preview.quote.detail}
        </div>
      ) : null}

      {preview.audit ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/48">
          Server cannot sign transactions. {preview.audit.approvalRequired ? "User wallet approval required before broadcast." : "No user wallet approval is required for this non-executable action."}
        </div>
      ) : null}
    </section>
  );
}
