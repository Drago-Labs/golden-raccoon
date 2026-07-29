import { useState } from "react";
import type { TransactionPreview as Preview } from "@/server/types";
import { formatUsd } from "@/lib/format";
import { RefreshCw, AlertTriangle, Clock, CheckCircle2, XCircle } from "lucide-react";

function formatAssetDisplay(asset: string): string {
  // For Stellar classic assets: show code and truncated issuer
  // e.g., "USDC:GBBD47IF..." or "XLM"
  if (asset.includes(":")) {
    const [code, issuer] = asset.split(":");
    const truncated = issuer.length > 12 ? `${issuer.slice(0, 6)}...${issuer.slice(-4)}` : issuer;
    return `${code}:${truncated}`;
  }
  return asset;
}

function formatExpiry(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "Expired";
  const seconds = Math.floor(remaining / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function isQuoteExpired(expiresAt?: string): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() < Date.now();
}

export function TransactionPreview({ preview, onRefresh }: { preview: Preview; onRefresh?: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const quoteExpired = isQuoteExpired(preview.quote?.expiresAt);
  const quoteStale = preview.quote?.status === "stale" || quoteExpired;
  const quoteMismatch = preview.quote?.quoteMismatch === true;
  const quoteUnavailable = preview.quote?.status === "unavailable";
  const showQuoteDetail = preview.quote && preview.action !== "trustline" && preview.action !== "no_action" && preview.action !== "watchlist";

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

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
          {preview.percent ? ` \u00b7 ${preview.percent}% ${preview.fromToken ?? "TOKEN"} to ${preview.toToken ?? "USDC"}` : null}
        </div>
      )}

      {/* Quote details panel */}
      {showQuoteDetail ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.14em] text-white/38">Live quote</div>
            <div className="flex items-center gap-2">
              {quoteUnavailable ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200">
                  <XCircle className="h-3 w-3" />
                  Unavailable
                </span>
              ) : quoteStale ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#d9a441]/15 px-2 py-0.5 text-[11px] text-[#d9a441]">
                  <Clock className="h-3 w-3" />
                  {quoteExpired ? "Expired" : "Stale"}
                </span>
              ) : quoteMismatch ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200">
                  <AlertTriangle className="h-3 w-3" />
                  Mismatch
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Fresh
                </span>
              )}
              {onRefresh ? (
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/56 transition hover:bg-white/10 disabled:opacity-50"
                  aria-label="Refresh quote"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {/* Route */}
            <div className="rounded-xl bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/32">Route</div>
              <div className="mt-1 text-sm font-medium text-white/72 break-all">
                {preview.quote?.route.map((hop, i) => (
                  <span key={hop}>
                    {i > 0 ? <span className="mx-1 text-white/24">\u2192</span> : null}
                    {formatAssetDisplay(hop)}
                  </span>
                ))}
              </div>
            </div>
            {/* Provider & Network */}
            <div className="rounded-xl bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/32">Provider & Network</div>
              <div className="mt-1 text-sm font-medium text-white/72">
                {preview.quote?.provider?.replaceAll("_", " ")} &middot; {preview.quote?.network ?? preview.network}
              </div>
            </div>
            {/* Exact Input */}
            <div className="rounded-xl bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/32">Exact input</div>
              <div className="mt-1 text-sm font-medium text-white/72">
                {preview.quote?.exactInput?.amount ?? 0} {formatAssetDisplay(preview.quote?.exactInput?.token ?? "")}
              </div>
            </div>
            {/* Exact Output */}
            <div className="rounded-xl bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/32">Expected output</div>
              <div className="mt-1 text-sm font-medium text-white/72">
                {preview.quote?.expectedOutputAmount ?? 0} {formatAssetDisplay(preview.quote?.expectedOutputToken ?? "")}
              </div>
            </div>
            {/* Minimum Received (post-slippage) */}
            <div className="rounded-xl bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/32">Min received</div>
              <div className="mt-1 text-sm font-medium text-white/72">
                {preview.quote?.minReceiveAmount ?? 0} {formatAssetDisplay(preview.quote?.expectedOutputToken ?? "")}
              </div>
            </div>
            {/* Price Impact & Slippage */}
            <div className="rounded-xl bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/32">Impact & Slippage</div>
              <div className="mt-1 text-sm font-medium text-white/72">
                {preview.quote?.priceImpactBps ?? 0} bps impact &middot; {preview.quote?.slippageBps ?? 0} bps slippage
              </div>
            </div>
            {/* Fees */}
            <div className="rounded-xl bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/32">Fees</div>
              <div className="mt-1 text-sm font-medium text-white/72">
                {formatUsd(preview.quote?.feesUsd ?? preview.gasEstimateUsd ?? 0)}
              </div>
            </div>
            {/* Expiry */}
            <div className="rounded-xl bg-black/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/32">Expires</div>
              <div className={`mt-1 text-sm font-medium ${quoteExpired ? "text-red-300" : "text-white/72"}`}>
                {formatExpiry(preview.quote?.expiresAt ?? "")}
              </div>
            </div>
          </div>

          {preview.quote?.detail ? (
            <div className="mt-3 rounded-xl border border-white/6 bg-white/4 px-3 py-2 text-xs text-white/42">
              {preview.quote.detail}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Policy violations — show exact thresholds */}
      {preview.policyStatus?.violations.length ? (
        <div className="mt-3 rounded-2xl border border-red-300/20 bg-red-500/10 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-200">Policy violations</div>
          <ul className="mt-2 space-y-1">
            {preview.policyStatus.violations.map((v) => (
              <li key={v} className="text-sm text-red-100/82">{v}</li>
            ))}
          </ul>
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
          <div className="text-xs text-white/38">Execution</div>
          <div className={`mt-1 text-sm font-semibold ${preview.executionReady ? "text-emerald-300" : "text-red-300"}`}>
            {preview.executionReady ? "Ready" : "Not ready"}
          </div>
        </div>
      </div>

      {preview.audit ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/48">
          Server cannot sign transactions. {preview.audit.approvalRequired ? "User wallet approval required before broadcast." : "No user wallet approval is required for this non-executable action."}
        </div>
      ) : null}
    </section>
  );
}
