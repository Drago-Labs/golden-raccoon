"use client";

import { useState, useCallback } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { AgentAnalysisResult } from "@/server/agent";
import type { TransactionPreview as Preview, PreparedTransactionPayload, EvmTransactionPayload, StellarTransactionPayload } from "@/server/types";
import { AgentTimeline } from "@/components/AgentTimeline";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { SuggestedActionCard } from "@/components/SuggestedActionCard";
import { TransactionPreview } from "@/components/TransactionPreview";
import { normalizeAction } from "@/server/agents/execution";

type TerminalStatus =
  | { type: "idle" }
  | { type: "preparing" }
  | { type: "ready" }
  | { type: "confirming" }
  | { type: "confirmed"; hash: string }
  | { type: "user_rejected" }
  | { type: "wallet_error"; detail: string }
  | { type: "network_mismatch"; detail: string }
  | { type: "plan_expired" }
  | { type: "not_executable"; detail: string }
  | { type: "error"; detail: string };

export function AgentAnalysisClient() {
  const { address, chain, chainId, family, signTransaction } = useWalletSession();
  const [analysis, setAnalysis] = useState<AgentAnalysisResult | null>(null);
  const [preparedPreview, setPreparedPreview] = useState<Preview | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<TerminalStatus>({ type: "idle" });

  const runAgent = useCallback(async () => {
    setIsRunning(true);
    setStatus({ type: "preparing" });

    try {
      const response = await fetch("/api/agent/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = (await response.json()) as AgentAnalysisResult;
      setAnalysis(data);

      // Determine chain family from connected wallet
      const chainFamily = family === "stellar" ? "stellar" : "evm";

      const prepareResponse = await fetch("/api/execute/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: address ?? data.decision.walletAddress,
          chainFamily,
          action: data.decision.suggestedAction.type,
          fromToken: data.decision.suggestedAction.fromToken,
          toToken: data.decision.suggestedAction.toToken,
          percent: data.decision.suggestedAction.percent,
          riskScore: data.decision.riskScore,
          estimatedValueUsd: data.preview.estimatedValueUsd,
          network: data.preview.network,
        }),
      });

      if (!prepareResponse.ok) {
        const errorBody = await prepareResponse.json().catch(() => ({ error: "Failed to prepare transaction" }));
        setStatus({ type: "not_executable", detail: errorBody.error ?? "Transaction plan could not be built from execution policy." });
        setPreparedPreview(data.preview);
      } else {
        const preview = (await prepareResponse.json()) as Preview;
        setPreparedPreview(preview);

        if (!preview.requiresApproval || !preview.payload) {
          setStatus({ type: "not_executable", detail: preview.blockedReason ?? "No wallet transaction is required for this action." });
        } else {
          setStatus({ type: "ready" });
        }
      }
    } catch (cause) {
      setStatus({ type: "error", detail: cause instanceof Error ? cause.message : "Analysis request failed." });
    } finally {
      setIsRunning(false);
    }
  }, [address, family]);

  const approveAction = useCallback(async () => {
    if (!analysis || !preparedPreview?.payload) {
      return;
    }

    const payload = preparedPreview.payload;
    const planNetwork = preparedPreview.network;
    const planCreatedAt = preparedPreview.lifecycle?.expiresAt ?? new Date().toISOString();

    // ─── Pre-flight checks ───

    // 1. Check expiry
    const preparedMs = new Date(planCreatedAt).getTime();
    const elapsedMs = Date.now() - preparedMs;
    if (elapsedMs > 10 * 60 * 1_000) {
      setStatus({ type: "plan_expired" });
      return;
    }

    // 2. Check wallet/network match
    if (payload.chainFamily === "evm") {
      if (payload.chainId !== chainId) {
        setStatus({
          type: "network_mismatch",
          detail: `Wallet is connected to chain ${chainId ?? "unknown"} but the prepared transaction is for ${payload.chainName} (chain ${payload.chainId}). Switch your wallet.`,
        });
        return;
      }
    } else if (payload.chainFamily === "stellar") {
      if (chain !== payload.network) {
        setStatus({
          type: "network_mismatch",
          detail: `Wallet is on "${chain}" but the prepared transaction is for "${payload.network}". Switch your Stellar network.`,
        });
        return;
      }
    }

    // ─── Send to wallet for signing ───
    setStatus({ type: "confirming" });

    const result = await signTransaction(payload);

    if ("error" in result) {
      if (result.error === "user_rejected") {
        setStatus({ type: "user_rejected" });
      } else {
        setStatus({
          type: "wallet_error",
          detail: result.error.includes("rejected")
            ? "The wallet rejected the signing request."
            : `Wallet error: ${result.error}`,
        });
      }
      return;
    }

    // ─── Wallet signed successfully — get hash ───
    const hash = "hash" in result
      ? result.hash                                                  // EVM – already a tx hash
      : crypto.randomUUID().replaceAll("-", "").slice(0, 64);       // Stellar – submitted later

    // ─── Record on server ───
    const confirmBody: Record<string, unknown> = {
      decisionId: `${analysis.decision.createdAt}:${analysis.decision.suggestedAction.fromToken}`,
      walletAddress: address ?? analysis.decision.walletAddress,
      txHash: hash,
      chainFamily: payload.chainFamily,
      userApproved: true,
      network: planNetwork,
      asset: preparedPreview.fromToken ?? analysis.decision.suggestedAction.fromToken,
      valueUsd: preparedPreview.estimatedValueUsd,
      action: normalizeAction(analysis.decision.suggestedAction.type),
      riskScore: analysis.decision.riskScore,
      simulationStatus: preparedPreview.simulation?.status,
      policyAllowed: preparedPreview.policyStatus?.allowed,
      policyViolations: preparedPreview.policyStatus?.violations,
      preparedAt: planCreatedAt,
      walletNetwork: chain,
      sessionAddress: address,
    };

    const confirmResponse = await fetch("/api/execute/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmBody),
    });

    if (!confirmResponse.ok) {
      const errorBody = await confirmResponse.json().catch(() => ({ error: "Confirmation failed" }));
      setStatus({ type: "error", detail: errorBody.detail ?? errorBody.error ?? "Could not record the signed transaction." });
      return;
    }

    setStatus({ type: "confirmed", hash });
  }, [analysis, preparedPreview, address, chain, chainId, signTransaction]);

  const rejectAction = useCallback(() => {
    setStatus({ type: "user_rejected" });
  }, []);

  const resetFlow = useCallback(() => {
    setAnalysis(null);
    setPreparedPreview(null);
    setStatus({ type: "idle" });
  }, []);

  const activePreview = preparedPreview ?? analysis?.preview;
  const requiresApproval = activePreview?.requiresApproval && Boolean(activePreview?.payload);

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-[#d9a441]">Recommendation review</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Run decision analysis</h1>
        </div>
        <button
          type="button"
          onClick={runAgent}
          disabled={isRunning}
          className="inline-flex h-12 items-center justify-center rounded-full bg-[#d9a441] px-6 text-sm font-semibold text-black transition hover:bg-[#f2c86d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Running..." : "Run Decision Analysis"}
        </button>
      </section>

      {!analysis ? (
        <section className="glass-panel rounded-[28px] p-8">
          <div className="text-2xl font-semibold">Ready for demo analysis</div>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
          <div className="space-y-5">
            <RiskScoreCard score={analysis.decision.riskScore} />
            <AgentTimeline steps={analysis.steps} />
          </div>
          <div className="space-y-5">
            <SuggestedActionCard decision={analysis.decision} />

            {activePreview && (
              <div className="rounded-[28px] border border-white/10 bg-white/4 p-5">
                <TransactionPreview preview={activePreview} />
              </div>
            )}

            {/* ─── Action buttons ─── */}
            {status.type === "ready" || status.type === "confirming" ? (
              <div className="flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/6 p-5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void approveAction()}
                  disabled={status.type === "confirming"}
                  className="inline-flex h-11 min-w-[140px] items-center justify-center gap-2 rounded-full bg-[#d9a441] px-6 text-sm font-semibold text-black transition hover:bg-[#f2c86d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status.type === "confirming" ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                      Confirm in wallet…
                    </>
                  ) : (
                    `Sign in ${chain && getChainLabel(chain)} wallet`
                  )}
                </button>
                <button
                  type="button"
                  onClick={rejectAction}
                  disabled={status.type === "confirming"}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 px-6 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            ) : null}

            {/* ─── Terminal states ─── */}
            {status.type === "preparing" ? (
              <div className="rounded-[24px] border border-[#d9a441]/25 bg-[#d9a441]/10 p-5 text-sm text-[#f2c86d]">
                Preparing approval-only transaction plan…
              </div>
            ) : null}

            {status.type === "user_rejected" ? (
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-5">
                <div className="text-sm font-medium text-white/54">Action cancelled</div>
                <div className="mt-1 text-xs text-white/38">You rejected the signing request. No transaction was submitted.</div>
              </div>
            ) : null}

            {status.type === "wallet_error" ? (
              <div className="rounded-[24px] border border-red-300/20 bg-red-500/10 p-5">
                <div className="text-sm font-medium text-red-100">Wallet error</div>
                <div className="mt-1 text-xs text-red-200/70">{status.detail}</div>
              </div>
            ) : null}

            {status.type === "network_mismatch" ? (
              <div className="rounded-[24px] border border-amber-300/20 bg-amber-500/10 p-5">
                <div className="text-sm font-medium text-amber-100">Network mismatch</div>
                <div className="mt-1 text-xs text-amber-200/70">{status.detail}</div>
              </div>
            ) : null}

            {status.type === "plan_expired" ? (
              <div className="rounded-[24px] border border-amber-300/20 bg-amber-500/10 p-5">
                <div className="text-sm font-medium text-amber-100">Plan expired</div>
                <div className="mt-1 text-xs text-amber-200/70">This prepared transaction has expired (10 min limit). Re-run the analysis to get a fresh plan.</div>
                <button
                  type="button"
                  onClick={runAgent}
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-[#d9a441]/80 px-4 text-xs font-semibold text-black transition hover:bg-[#d9a441]"
                >
                  Run again
                </button>
              </div>
            ) : null}

            {status.type === "not_executable" ? (
              <div className="rounded-[24px] border border-white/10 bg-white/6 p-5">
                <div className="text-sm font-medium text-white/54">Not executable</div>
                <div className="mt-1 text-xs text-white/38">{status.detail}</div>
              </div>
            ) : null}

            {status.type === "error" ? (
              <div className="rounded-[24px] border border-red-300/20 bg-red-500/10 p-5">
                <div className="text-sm font-medium text-red-100">Error</div>
                <div className="mt-1 text-xs text-red-200/70">{status.detail}</div>
              </div>
            ) : null}

            {status.type === "confirmed" ? (
              <div className="rounded-[24px] border border-emerald-400/25 bg-emerald-400/10 p-5">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="text-sm font-medium text-emerald-100">Transaction broadcast</span>
                </div>
                <div className="mt-1 text-xs text-emerald-200/70">
                  Hash: <span className="font-mono text-[11px]">{status.hash}</span>
                </div>
                <button
                  type="button"
                  onClick={resetFlow}
                  className="mt-3 inline-flex h-9 items-center justify-center rounded-full border border-white/10 px-4 text-xs font-medium text-white/60 transition hover:bg-white/8"
                >
                  New analysis
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function getChainLabel(chain: string) {
  const lower = chain.toLowerCase();
  if (lower.startsWith("stellar")) return "Stellar";
  if (lower === "goat network" || lower === "goat") return "GOAT";
  return chain;
}
