"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Orbit } from "lucide-react";
import { getStellarNetwork, normalizeStellarNetworkId } from "@/lib/stellar/config";
import { useWalletSession } from "@/hooks/useWalletSession";

type PublishStage = "idle" | "preparing" | "signing" | "submitting" | "pending" | "success" | "error";

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
  const session = useWalletSession();
  const stellar = session.stellar;
  const networkId = normalizeStellarNetworkId(network);
  const config = getStellarNetwork(networkId ?? undefined);
  const [stage, setStage] = useState<PublishStage>("idle");
  const [error, setError] = useState<string>();
  const [hash, setHash] = useState<string>();

  if (!networkId || !assetKey || !config) return null;

  async function publish() {
    session.selectFamily("stellar");
    if (!stellar.address) {
      await stellar.connect().catch(() => undefined);
      return;
    }

    try {
      setError(undefined);
      await stellar.prepareSigning(networkId ?? undefined);
      setStage("preparing");
      const preparedResponse = await fetch("/api/stellar/registry/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: networkId, publisher: stellar.address, assetKey, assetLabel, score, verdict, report, evidenceUri: "" }),
      });
      const prepared = await preparedResponse.json() as { xdr?: string; error?: string };
      if (!preparedResponse.ok || !prepared.xdr) throw new Error(prepared.error ?? "Registry transaction could not be prepared.");

      setStage("signing");
      const signedXdr = await stellar.signTransaction(prepared.xdr, networkId ?? undefined);
      setStage("submitting");
      const submitResponse = await fetch("/api/stellar/registry/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: networkId, signedXdr }),
      });
      const submitted = await submitResponse.json() as { hash?: string; status?: string; error?: string };
      if (!submitResponse.ok || !submitted.hash) throw new Error(submitted.error ?? "Signed transaction could not be submitted.");
      setHash(submitted.hash);
      setStage(submitted.status === "SUCCESS" ? "success" : "pending");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Risk publication failed.");
      setStage("error");
    }
  }

  const working = ["preparing", "signing", "submitting"].includes(stage);
  const label = stage === "preparing" ? "Simulating" : stage === "signing" ? "Confirm in wallet" : stage === "submitting" ? "Submitting" : stage === "success" ? "Published on Stellar" : stage === "pending" ? "Submitted to Stellar" : stellar.address ? "Publish proof to Stellar" : "Connect Stellar wallet";

  return (
    <div className="mt-4">
      <button type="button" onClick={() => void publish()} disabled={working || stage === "success" || stage === "pending"} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#a99aff]/35 bg-[#7b61ff]/12 px-5 text-sm font-semibold text-white transition hover:bg-[#7b61ff]/20 disabled:cursor-not-allowed disabled:opacity-60">
        {working ? <Loader2 className="h-4 w-4 animate-spin" /> : stage === "success" || stage === "pending" ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Orbit className="h-4 w-4 text-[#a99aff]" />}
        {label}
      </button>
      {error ? <div className="mt-2 text-xs text-red-200">{error}</div> : null}
      {hash ? <a href={`${config.explorerUrl}/tx/${hash}`} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-xs text-[#a99aff]">View transaction <ExternalLink className="h-3 w-3" /></a> : null}
    </div>
  );
}
