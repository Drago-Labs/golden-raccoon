"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useWalletClient, useSwitchChain, useChainId } from "wagmi";
import { useStellarWallet } from "@/providers/StellarWalletProvider";
import { useWalletSession } from "@/hooks/useWalletSession";
import type {
  ApprovalValidationResult,
  PreparedTransactionPayload,
  EvmPreparedTransactionPayload,
  StellarPreparedTransactionPayload,
} from "@/server/types";

type ApprovalState =
  | { phase: "idle" }
  | { phase: "validating" }
  | { phase: "ready_for_signing"; result: ApprovalValidationResult }
  | { phase: "signing" }
  | { phase: "signed"; signedPayload: string }
  | { phase: "submitting" }
  | { phase: "submitted"; txHash: string }
  | { phase: "rejected"; reason: string }
  | { phase: "expired" }
  | { phase: "wallet_error"; error: string }
  | { phase: "network_mismatch"; expectedNetwork: string; connectedNetwork: string }
  | { phase: "error"; error: string };

type ApprovalFlowClientProps = {
  idempotencyKey: string;
  walletAddress: string;
  chainFamily: "evm" | "stellar";
  network: string;
  sourceAccount?: string;
  onComplete?: (txHash: string) => void;
  onDismiss?: () => void;
};

export function ApprovalFlowClient({
  idempotencyKey,
  walletAddress,
  chainFamily,
  network,
  sourceAccount,
  onComplete,
  onDismiss,
}: ApprovalFlowClientProps) {
  const session = useWalletSession();
  const evm = useAccount();
  const evmChainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const stellar = useStellarWallet();

  const [state, setState] = useState<ApprovalState>({ phase: "idle" });
  const [payload, setPayload] = useState<PreparedTransactionPayload | null>(null);

  // Auto-validate when the component mounts
  useEffect(() => {
    if (state.phase === "idle") {
      validateApproval();
    }
  }, []);

  const validateApproval = useCallback(async () => {
    setState({ phase: "validating" });

    try {
      const connectedWallet = session.address;
      const connectedNetwork =
        chainFamily === "stellar"
          ? stellar.network
          : evm.chain?.name ?? evm.chainId?.toString();

      const response = await fetch("/api/execute/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          walletAddress,
          chainFamily,
          network,
          sourceAccount,
          connectedWallet,
          connectedNetwork,
        }),
      });

      const result: ApprovalValidationResult = await response.json();

      if (!response.ok || !result.allowed) {
        if (result.expired) {
          setState({ phase: "expired" });
        } else if (!result.networkOk) {
          setState({
            phase: "network_mismatch",
            expectedNetwork: network,
            connectedNetwork: connectedNetwork ?? "unknown",
          });
        } else if (!result.walletOk) {
          setState({
            phase: "wallet_error",
            error: `Wrong wallet connected. Expected ${walletAddress}, got ${connectedWallet}`,
          });
        } else {
          setState({ phase: "error", error: result.blockedReason ?? "Approval denied." });
        }
        return;
      }

      setPayload(result.payload ?? null);
      setState({ phase: "ready_for_signing", result });
    } catch (error) {
      setState({
        phase: "error",
        error: error instanceof Error ? error.message : "Failed to validate approval.",
      });
    }
  }, [idempotencyKey, walletAddress, chainFamily, network, sourceAccount, session.address, stellar.network, evm.chain, evm.chainId]);

  const handleSignAndSubmit = useCallback(async () => {
    if (state.phase !== "ready_for_signing" || !payload) return;

    setState({ phase: "signing" });

    try {
      let signedPayload: string;

      if (chainFamily === "evm") {
        // EVM signing via wagmi walletClient
        const evmPayload = payload as EvmPreparedTransactionPayload;
        const targetChainId = evmPayload.chainId;

        // Switch network if needed
        if (evmChainId !== targetChainId) {
          try {
            await switchChainAsync({ chainId: targetChainId });
          } catch {
            setState({
              phase: "wallet_error",
              error: `Please switch your wallet to chain ID ${targetChainId} to sign this transaction.`,
            });
            return;
          }
        }

        if (!walletClient) {
          setState({ phase: "wallet_error", error: "EVM wallet is not connected. Connect via RainbowKit first." });
          return;
        }

        // Sign the transaction via the connected wallet (does NOT broadcast).
        // The signed serialized tx is sent to /api/execute/submit which
        // calls sendRawTransaction to broadcast it. This keeps broadcast
        // on the server so lifecycle tracking is consistent.
        const signedTx = await walletClient.signTransaction({
          account: walletClient.account,
          to: evmPayload.to as `0x${string}`,
          data: (evmPayload.data || "0x") as `0x${string}`,
          value: BigInt(evmPayload.value || "0"),
          chainId: targetChainId,
          ...(evmPayload.gas ? { gas: BigInt(evmPayload.gas) } : {}),
          ...(evmPayload.gasPrice ? { gasPrice: BigInt(evmPayload.gasPrice) } : {}),
        } as never);

        signedPayload = signedTx;
      } else {
        // Stellar signing via Stellar Wallets Kit
        const stellarPayload = payload as StellarPreparedTransactionPayload;

        if (!stellar.isConnected || !stellar.address) {
          setState({ phase: "wallet_error", error: "Stellar wallet is not connected. Connect via Stellar Wallets Kit first." });
          return;
        }

        // Verify the source account matches
        if (stellarPayload.sourceAccount && stellar.address !== stellarPayload.sourceAccount) {
          setState({
            phase: "wallet_error",
            error: `Wrong Stellar account connected. Expected ${stellarPayload.sourceAccount}, got ${stellar.address}.`,
          });
          return;
        }

        signedPayload = await stellar.signTransaction(stellarPayload.xdr);
      }

      setState({ phase: "signed", signedPayload });

      // Submit the signed payload
      setState({ phase: "submitting" });

      const displayParams = (payload as { displayParams?: Record<string, unknown> })?.displayParams ?? {};
      const submitResponse = await fetch("/api/execute/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainFamily,
          network,
          walletAddress,
          sourceAccount,
          signedPayload,
          asset: String(displayParams.asset ?? walletAddress),
          valueUsd: Number(displayParams.valueUsd ?? 0),
          userApproved: true,
          idempotencyKey,
          decisionAction: String(displayParams.action ?? "swap"),
        }),
      });

      if (!submitResponse.ok) {
        const errorData = await submitResponse.json().catch(() => ({ detail: "Submission failed." }));
        setState({ phase: "wallet_error", error: errorData.detail ?? errorData.error ?? "Submission failed." });
        return;
      }

      const submitResult = await submitResponse.json();
      setState({ phase: "submitted", txHash: submitResult.hash ?? submitResult.transaction?.hash });        onComplete?.(submitResult.hash ?? submitResult.transaction?.hash);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signing failed.";

      // Detect user rejection
      if (
        message.toLowerCase().includes("rejected") ||
        message.toLowerCase().includes("cancelled") ||
        message.toLowerCase().includes("canceled") ||
        message.toLowerCase().includes("denied")
      ) {
        // Record rejection
        try {
          await fetch("/api/execute/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "reject",
              idempotencyKey,
              walletAddress,
              reason: message,
            }),
          });
        } catch {
          // Best-effort
        }

        setState({ phase: "rejected", reason: message });
        onDismiss?.();
      } else {
        setState({ phase: "wallet_error", error: message });
      }
    }
  }, [state, payload, chainFamily, network, walletAddress, sourceAccount, idempotencyKey, walletClient, evmChainId, switchChainAsync, stellar, onComplete]);

  const handleReject = useCallback(async () => {
    try {
      await fetch("/api/execute/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          idempotencyKey,
          walletAddress,
          reason: "User rejected in the frontend UI.",
        }),
      });
    } catch {
      // Best-effort
    }

    setState({ phase: "rejected", reason: "User rejected in the frontend UI." });
    onDismiss?.();
  }, [idempotencyKey, walletAddress, onDismiss]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      {/* Step indicator */}
      <TransactionFlowSteps phase={state.phase} />

      {/* Payload details */}
      {payload && (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-medium text-white">Transaction details</h3>
          {chainFamily === "evm" ? (
            <EvmPayloadDetails payload={payload as EvmPreparedTransactionPayload} />
          ) : (
            <StellarPayloadDetails payload={payload as StellarPreparedTransactionPayload} />
          )}
          {/* Policy status */}
          {(() => {
            const dp = (payload as { displayParams?: Record<string, unknown> })?.displayParams;
            if (!dp) return null;
            const policyAllowed = dp.policyAllowed;
            const policyViolations = dp.policyViolations as string[] | undefined;
            if (policyAllowed === undefined) return null;
            return (
              <div className="rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-xs">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-slate-400">Policy status</span>
                  <span className={policyAllowed ? "text-emerald-300" : "text-rose-300"}>
                    {policyAllowed ? "Allowed" : "Blocked"}
                  </span>
                </div>
                {policyViolations && policyViolations.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {policyViolations.map((v, i) => (
                      <li key={i} className="text-rose-300/70">{v}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Wallet/network identity */}
      <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-xs text-slate-300">
        <div className="flex items-center justify-between">
          <span>Connected wallet:</span>
          <span className="font-mono text-emerald-300">
            {session.address ? `${session.address.slice(0, 8)}...${session.address.slice(-4)}` : "Not connected"}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span>Network:</span>
          <span className="text-sky-300">{chainFamily === "stellar" ? stellar.network : evm.chain?.name ?? `Chain ${evm.chainId}`}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span>Prepared for:</span>
          <span className="text-slate-400">{network}</span>
        </div>
      </div>

      {/* Status-specific UI */}
      <div className="mt-4">
        <StatusPanel
          state={state}
          onRetry={validateApproval}
          onSign={handleSignAndSubmit}
          onReject={handleReject}
          onClose={handleReject}
        />
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function TransactionFlowSteps({ phase }: { phase: ApprovalState["phase"] }) {
  const steps = [
    { key: "validating", label: "Validate" },
    { key: "ready_for_signing", label: "Review" },
    { key: "signing", label: "Sign" },
    { key: "submitting", label: "Submit" },
    { key: "submitted", label: "Done" },
  ] as const;

  const currentStepIndex = steps.findIndex((s) => s.key === phase);
  const resolvedIndex = currentStepIndex >= 0 ? currentStepIndex : 0;

  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((step, i) => {
        const isActive = i <= resolvedIndex;
        const isCurrent = i === resolvedIndex;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium transition-colors ${
                isActive && phase !== "error" && phase !== "rejected"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-slate-800 text-slate-500"
              } ${isCurrent ? "ring-1 ring-emerald-500/30" : ""}`}
            >
              {i + 1}
            </span>
            <span
              className={`${
                isActive && phase !== "error" && phase !== "rejected"
                  ? "text-slate-300"
                  : "text-slate-600"
              }`}
            >
              {step.label}
            </span>
            {i < steps.length - 1 && <span className="text-slate-700">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function EvmPayloadDetails({ payload }: { payload: EvmPreparedTransactionPayload }) {
  const calldataPreview = payload.data && payload.data !== "0x"
    ? `${payload.data.slice(0, 42)}...`
    : "None";
  const disp = payload.displayParams ?? {};
  const valueUsd = typeof disp.valueUsd === "number" ? `$${disp.valueUsd.toFixed(2)}` : null;
  const action = typeof disp.action === "string" ? disp.action.replaceAll("_", " ") : "Unknown";

  return (
    <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Target contract</span>
        <span className="font-mono text-white text-[10px]">{payload.to}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Action</span>
        <span className="capitalize text-sky-300">{action}</span>
      </div>
      {valueUsd && (
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Estimated value</span>
          <span className="text-emerald-300">{valueUsd}</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Method</span>
        <span className="text-white">{payload.method ?? "Unknown"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Chain ID</span>
        <span className="text-white">{payload.chainId}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Value</span>
        <span className="text-white">{payload.value} wei</span>
      </div>
      {payload.gas && (
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Gas limit</span>
          <span className="text-white">{payload.gas}</span>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-slate-400">Calldata (truncated)</span>
        <span className="break-all font-mono text-[10px] text-slate-300">{calldataPreview}</span>
      </div>
      {payload.displayParams?.expectedEffects && (
        <div>
          <span className="text-slate-400">Expected effects</span>
          <ul className="mt-1 space-y-1 pl-2">
            {(payload.displayParams.expectedEffects as Array<{ kind: string; from?: string; to?: string; amount?: string }>).map(
              (effect, i) => (
                <li key={i} className="text-slate-300">
                  <span className="capitalize">{effect.kind}</span>
                  {effect.amount ? `: ${effect.amount}` : ""}
                  {effect.to ? ` → ${effect.to.slice(0, 10)}...` : ""}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function StellarPayloadDetails({ payload }: { payload: StellarPreparedTransactionPayload }) {
  const xdrPreview = payload.xdr ? `${payload.xdr.slice(0, 32)}...` : "None";
  const disp = payload.displayParams ?? {};
  const valueUsd = typeof disp.valueUsd === "number" ? `$${disp.valueUsd.toFixed(2)}` : null;
  const action = typeof disp.action === "string" ? disp.action.replaceAll("_", " ") : "Unknown";

  return (
    <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Source account</span>
        <span className="font-mono text-white text-[10px]">{payload.sourceAccount}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Action</span>
        <span className="capitalize text-sky-300">{action}</span>
      </div>
      {valueUsd && (
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Estimated value</span>
          <span className="text-emerald-300">{valueUsd}</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Network</span>
        <span className="text-sky-300">{payload.networkPassphrase}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-400">Operations</span>
        <span className="text-white">{payload.operations.length}</span>
      </div>
      {payload.fee !== undefined && (
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Fee</span>
          <span className="text-white">{payload.fee} stroops</span>
        </div>
      )}
      {payload.sequence && (
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Sequence</span>
          <span className="font-mono text-white">{payload.sequence.slice(0, 12)}...</span>
        </div>
      )}
      {payload.timeBounds && (
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Time bounds</span>
          <span className="text-white">
            {payload.timeBounds.minTime ?? "-"} - {payload.timeBounds.maxTime ?? "-"}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-slate-400">XDR envelope (truncated)</span>
        <span className="break-all font-mono text-[10px] text-slate-300">{xdrPreview}</span>
      </div>
      {payload.operations.length > 0 && (
        <div>
          <span className="text-slate-400">Operation details</span>
          <ul className="mt-1 space-y-1 pl-2">
            {payload.operations.map((op, i) => (
              <li key={i} className="text-slate-300">
                <span className="capitalize">{op.type}</span>
                {op.amount ? `: ${op.amount}` : ""}
                {op.asset ? ` ${op.asset}` : ""}
                {op.destination ? ` → ${op.destination.slice(0, 8)}...` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusPanel({
  state,
  onRetry,
  onSign,
  onReject,
  onClose,
}: {
  state: ApprovalState;
  onRetry: () => void;
  onSign: () => void;
  onReject: () => void;
  onClose?: () => void;
}) {
  switch (state.phase) {
    case "idle":
    case "validating":
      return (
        <div className="flex items-center justify-center gap-3 py-4 text-sm text-slate-400">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Validating transaction...
        </div>
      );

    case "ready_for_signing":
      return (
        <div className="flex flex-col gap-3">
          <button
            onClick={onSign}
            className="w-full rounded-xl bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/30"
          >
            Sign &amp; submit in wallet
          </button>
          <button
            onClick={onReject}
            className="w-full rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/15"
          >
            Reject
          </button>
        </div>
      );

    case "signing":
      return (
        <div className="flex items-center justify-center gap-3 py-4 text-sm text-slate-400">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Waiting for wallet signature...
        </div>
      );

    case "signed":
      return (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Transaction signed. Proceeding to submission...
        </div>
      );

    case "submitting":
      return (
        <div className="flex items-center justify-center gap-3 py-4 text-sm text-slate-400">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Submitting transaction...
        </div>
      );

    case "submitted":
      return (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4">
          <div className="text-sm font-semibold text-emerald-200">Transaction submitted</div>
          <div className="mt-1 text-xs text-slate-400">Hash: {state.txHash}</div>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-3 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Close
            </button>
          )}
        </div>
      );

    case "rejected":
      return (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-4">
          <div className="text-sm font-semibold text-amber-200">Transaction rejected</div>
          <div className="mt-1 text-xs text-amber-300/70">{state.reason}</div>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-3 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Close
            </button>
          )}
        </div>
      );

    case "expired":
      return (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-4">
          <div className="text-sm font-semibold text-rose-200">Plan expired</div>
          <div className="mt-1 text-xs text-rose-300/70">
            The prepared transaction expired after 10 minutes. Please prepare a new plan.
          </div>
          <button
            onClick={onRetry}
            className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20"
          >
            Retry validation
          </button>
        </div>
      );

    case "wallet_error":
      return (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-4">
          <div className="text-sm font-semibold text-rose-200">Wallet error</div>
          <div className="mt-1 text-xs text-rose-300/70">{state.error}</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onRetry}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Try again
            </button>
            <button
              onClick={onReject}
              className="rounded-lg border border-rose-500/20 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
            >
              Cancel
            </button>
          </div>
        </div>
      );

    case "network_mismatch":
      return (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-4">
          <div className="text-sm font-semibold text-rose-200">Network mismatch</div>
          <div className="mt-1 text-xs text-rose-300/70">
            Connected to {state.connectedNetwork}, but the transaction expects {state.expectedNetwork}.
            Switch networks in your wallet and try again.
          </div>
          <button
            onClick={onRetry}
            className="mt-3 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Try again
          </button>
        </div>
      );

    case "error":
      return (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-4">
          <div className="text-sm font-semibold text-rose-200">Error</div>
          <div className="mt-1 text-xs text-rose-300/70">{state.error}</div>
          <button
            onClick={onRetry}
            className="mt-3 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Try again
          </button>
        </div>
      );
  }
}
