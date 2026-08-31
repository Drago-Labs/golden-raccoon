"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Orbit, Shield, Hash, Fuel, Layers, Clock, FileText } from "lucide-react";
import { getStellarNetwork, normalizeStellarNetworkId } from "@/lib/stellar/config";
import { useStellarWallet } from "@/providers/StellarWalletProvider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

type PublishStage = "idle" | "preview" | "simulating" | "preview_ready" | "signing" | "submitting" | "verifying" | "success" | "failed";

type PreviewData = {
  xdr: string;
  network: string;
  networkPassphrase: string;
  contractId: string;
  publisher: string;
  assetId: string;
  reportHash: string;
  expiresAt: number;
  fee: number;
  footprint: { readOnly: number; readWrite: number; hasRestoreEntry: boolean };
  simulationPassed: boolean;
  resourceUsage?: { instructions: number; readBytes: number; writeBytes: number };
  assetLabel: string;
  score: number;
  verdict: string;
};

type VerifyOutcome = {
  stage: string;
  hash: string;
  ledger?: number;
  events?: unknown[];
  onchainReportHash?: string;
  localReportHash?: string;
  hashMatch?: boolean;
  detail: string;
};

function shortHex(hex: string, chars = 8): string {
  return hex.length > chars * 2 + 3 ? hex.slice(0, chars) + "..." + hex.slice(-chars) : hex;
}

export function StellarRiskPublishButton({
  network,
  assetKey,
  assetLabel,
  score,
  verdict,
  report,
}: {
  network?: string;
  assetKey?: string;
  assetLabel: string;
  score: number;
  verdict: string;
  report: unknown;
}) {
  const stellar = useStellarWallet();
  const { actionsDisabled } = useOnlineStatus();
  const networkId = normalizeStellarNetworkId(network);
  const config = getStellarNetwork(networkId ?? undefined);
  const [stage, setStage] = useState<PublishStage>("idle");
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<PreviewData>();
  const [verifyOutcome, setVerifyOutcome] = useState<VerifyOutcome>();
  const [txHash, setTxHash] = useState<string>();
  const [verifyProgress, setVerifyProgress] = useState<string>("");
  const [now, setNow] = useState<number>(() => Date.now());

  // Refresh the clock periodically so expiry display updates
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, []);

  if (!networkId || !assetKey || !config) return null;

  async function startPreview() {
    if (actionsDisabled) return;
    if (!stellar.address) {
      await stellar.connect().catch(() => undefined);
      return;
    }
    if (stellar.network !== networkId) {
      setError("Wallet is on " + stellar.network + "; switch it to " + networkId + ".");
      setStage("failed");
      return;
    }

    try {
      setError(undefined);
      setStage("simulating");
      const previewResponse = await fetch("/api/stellar/registry/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: networkId,
          publisher: stellar.address,
          assetKey,
          assetLabel,
          score,
          verdict,
          report,
          evidenceUri: "",
        }),
      });
      const data = await previewResponse.json() as PreviewData & { error?: string };
      if (!previewResponse.ok || !data.xdr) {
        throw new Error(data.error ?? "Could not prepare registry transaction preview.");
      }
      setPreview(data);
      setStage("preview_ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to prepare preview.");
      setStage("failed");
    }
  }

  async function signAndSubmit() {
    if (actionsDisabled || !preview || !stellar.address) return;

    try {
      setError(undefined);
      setStage("signing");

      // Check if the preview has expired
      if (Date.now() > preview.expiresAt) {
        throw new Error("Preview has expired (prepared > 120s ago). Click 'Start preview' again.");
      }

      const signedXdr = await stellar.signTransaction(preview.xdr);
      setStage("submitting");

      const submitResponse = await fetch("/api/stellar/registry/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: networkId, signedXdr }),
      });
      const submitted = await submitResponse.json() as { hash?: string; status?: string; error?: string };
      if (!submitResponse.ok || !submitted.hash) {
        throw new Error(submitted.error ?? "Signed transaction could not be submitted.");
      }

      setTxHash(submitted.hash);
      setStage("verifying");
      setVerifyProgress("Waiting for network confirmation...");

      // Poll for verification
      const verifyResponse = await fetch("/api/stellar/registry/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: networkId,
          hash: submitted.hash,
          localReportHash: preview.reportHash,
          assetKey,
        }),
      });
      const outcome = await verifyResponse.json() as VerifyOutcome & { ok?: boolean; error?: string };
      if (!verifyResponse.ok) {
        throw new Error(outcome.error ?? "Verification failed.");
      }

      setVerifyOutcome(outcome);

      if (outcome.stage === "success") {
        setStage("success");
      } else if (outcome.stage === "failed") {
        setError(outcome.detail);
        setStage("failed");
      } else {
        setVerifyProgress(outcome.detail);
        setStage("failed");
      }

      // Record in history (fire and forget)
      fetch("/api/stellar/registry/history", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }).catch(() => undefined);

    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Risk publication failed.");
      setStage("failed");
    }
  }

  const showStartButton = stage === "idle" || stage === "failed";
  const isSimulating = stage === "simulating";
  const previewExpired = preview && now > preview.expiresAt;

  return (
    <div className="mt-4 space-y-3">
      {/* Preview button */}
      {showStartButton && (
        <button
          type="button"
          onClick={() => void startPreview()}
          disabled={isSimulating || actionsDisabled}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#a99aff]/35 bg-[#7b61ff]/12 px-5 text-sm font-semibold text-white transition hover:bg-[#7b61ff]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSimulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Orbit className="h-4 w-4 text-[#a99aff]" />}
          {stellar.address ? "Start preview" : "Connect Stellar wallet"}
        </button>
      )}

      {/* Simulating state */}
      {stage === "simulating" && (
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          Simulating transaction and preparing preview...
        </div>
      )}

      {/* Preview panel */}
      {stage === "preview_ready" && preview && (
        <div className="rounded-lg border border-[#d9a441]/25 bg-[#d9a441]/8 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#f2c86d]">
            <Shield className="h-4 w-4" />
            Publication preview
          </div>

          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
              <span className="text-white/60">Asset</span>
              <span className="font-mono text-white">{preview.assetLabel}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
              <span className="text-white/60">Score / Verdict</span>
              <span className="font-mono text-white">{preview.score} / {preview.verdict}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
              <span className="flex items-center gap-1 text-white/60"><Hash className="h-3 w-3" /> Report hash</span>
              <span className="font-mono text-xs text-white/80" title={preview.reportHash}>{shortHex(preview.reportHash, 8)}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
              <span className="flex items-center gap-1 text-white/60"><Fuel className="h-3 w-3" /> Fee</span>
              <span className="font-mono text-white">{preview.fee} stroops</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
              <span className="flex items-center gap-1 text-white/60"><Layers className="h-3 w-3" /> Footprint</span>
              <span className="font-mono text-white">{preview.footprint.readOnly} read-only, {preview.footprint.readWrite} read-write{preview.footprint.hasRestoreEntry ? " + restore" : ""}</span>
            </div>
            {preview.resourceUsage && (
              <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
                <span className="flex items-center gap-1 text-white/60"><FileText className="h-3 w-3" /> Resources</span>
                <span className="font-mono text-xs text-white/80">
                  {preview.resourceUsage.instructions.toLocaleString()} instr, {preview.resourceUsage.readBytes.toLocaleString()}B read, {preview.resourceUsage.writeBytes.toLocaleString()}B write
                </span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
              <span className="flex items-center gap-1 text-white/60"><Clock className="h-3 w-3" /> Expiry</span>
              <span className="font-mono text-xs text-white/80">
                {previewExpired ? "EXPIRED" : new Date(preview.expiresAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
              <span className="text-white/60">Contract</span>
              <span className="font-mono text-xs text-white/80" title={preview.contractId}>{shortHex(preview.contractId, 6)}</span>
            </div>
          </div>

          {previewExpired ? (
            <div className="flex items-center gap-2 rounded-md bg-red-900/20 px-3 py-2 text-xs text-red-200">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Preview expired. Click &quot;Start preview&quot; again to get a fresh preview.
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signAndSubmit()}
              disabled={actionsDisabled}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#7b61ff] px-5 text-sm font-semibold text-white transition hover:bg-[#7b61ff]/80"
            >
              Sign with wallet &amp; submit
            </button>
          )}
        </div>
      )}

      {/* Signing / submitting / verifying states */}
      {["signing", "submitting", "verifying"].includes(stage) && (
        <div className="rounded-lg border border-[#d9a441]/25 bg-[#d9a441]/8 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            {stage === "signing" ? "Waiting for wallet signature..." :
             stage === "submitting" ? "Submitting to Stellar network..." :
             "Verifying onchain: " + (verifyProgress || "checking...")}
          </div>
          {txHash && (
            <div className="flex items-center gap-1 text-xs text-[#a99aff]">
              <ExternalLink className="h-3 w-3" />
              <a href={config.explorerUrl + "/tx/" + txHash} target="_blank" rel="noreferrer" className="hover:underline">
                View on {config.name} explorer
              </a>
            </div>
          )}
        </div>
      )}

      {/* Success state */}
      {stage === "success" && verifyOutcome && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Published on Stellar {networkId === "stellar-pubnet" ? "Pubnet" : "Testnet"}
          </div>

          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
              <span className="text-white/60">Hash match</span>
              <span className={verifyOutcome.hashMatch === true ? "text-emerald-300" : verifyOutcome.hashMatch === false ? "text-red-300" : "text-white/60"}>
                {verifyOutcome.hashMatch === true ? "Verified" : verifyOutcome.hashMatch === false ? "MISMATCH" : "Could not verify"}
              </span>
            </div>
            {verifyOutcome.ledger && (
              <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
                <span className="text-white/60">Ledger</span>
                <span className="font-mono text-white">{verifyOutcome.ledger}</span>
              </div>
            )}
            {verifyOutcome.events && verifyOutcome.events.length > 0 && (
              <div className="flex items-center justify-between rounded-md bg-black/24 px-3 py-2">
                <span className="text-white/60">Events emitted</span>
                <span className="font-mono text-white">{verifyOutcome.events.length}</span>
              </div>
            )}
          </div>

          <div className="text-xs text-white/52 leading-relaxed">
            {verifyOutcome.detail}
          </div>

          {txHash && (
            <a
              href={config.explorerUrl + "/tx/" + txHash}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#a99aff] hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View transaction on Stellar explorer
            </a>
          )}

          {verifyOutcome.hashMatch === false && (
            <div className="flex items-start gap-2 rounded-md bg-red-900/20 px-3 py-2 text-xs text-red-200">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Onchain report hash does not match the local report hash.
                Expected <code className="font-mono">{shortHex(verifyOutcome.localReportHash ?? "", 6)}</code>,
                got <code className="font-mono">{shortHex(verifyOutcome.onchainReportHash ?? "", 6)}</code>.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {stage === "failed" && error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-900/15 p-3 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="leading-relaxed">{error}</div>
        </div>
      )}

      {/* Error from old flow */}
      {error && !["failed", "idle"].includes(stage) && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-900/15 p-3 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="leading-relaxed">{error}</div>
        </div>
      )}
    </div>
  );
}
