"use client";

import { Check, Copy, Download, FileLock2, Loader2, ShieldX } from "lucide-react";
import { useState } from "react";
import type { RiskSnapshotCreateResponse, TokenScanResult } from "@/server/types";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

type Props = {
  source?: TokenScanResult;
  snapshotId?: string;
  shareUrl?: string;
  downloadUrl?: string;
};

export function RiskSnapshotActions({ source, snapshotId, shareUrl, downloadUrl }: Props) {
  const [created, setCreated] = useState<RiskSnapshotCreateResponse>();
  const [busy, setBusy] = useState<"create" | "revoke">();
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const { actionsDisabled } = useOnlineStatus();
  const activeId = created?.id ?? snapshotId;
  const activeShareUrl = created?.shareUrl ?? shareUrl ?? (activeId ? `/snapshots/${activeId}` : undefined);
  const activeDownloadUrl = created?.downloadUrl ?? downloadUrl ?? (activeId ? `/api/snapshots/${activeId}?download=1` : undefined);

  async function createSnapshot() {
    if (actionsDisabled || !source) return;
    setBusy("create");
    setError(undefined);
    setMessage(undefined);
    try {
      const response = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: source }),
      });
      const body = await response.json() as RiskSnapshotCreateResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Snapshot could not be created.");
      setCreated(body);
      setMessage("Snapshot created. Save the revocation token before leaving this page.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Snapshot could not be created.");
    } finally {
      setBusy(undefined);
    }
  }

  async function copyRevocationToken() {
    if (!created?.revocationToken) return;
    try {
      await navigator.clipboard.writeText(created.revocationToken);
      setTokenCopied(true);
      setMessage("Revocation token copied. Store it securely; it cannot be shown again after this page is closed.");
      window.setTimeout(() => setTokenCopied(false), 2_000);
    } catch {
      setError("The revocation token could not be copied.");
    }
  }

  async function copyShareLink() {
    if (!activeShareUrl) return;
    try {
      await navigator.clipboard.writeText(new URL(activeShareUrl, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("The share link could not be copied. Open it and copy the browser address instead.");
    }
  }

  async function revokeSnapshot() {
    if (actionsDisabled || !created?.revocationToken) return;
    setBusy("revoke");
    setError(undefined);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/snapshots/${created.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revocationToken: created.revocationToken }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Snapshot could not be revoked.");
      }
      setCreated(undefined);
      setMessage("Snapshot revoked. Its public report now fails closed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Snapshot could not be revoked.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {source && !created ? (
          <button type="button" onClick={() => void createSnapshot()} disabled={Boolean(busy) || actionsDisabled} className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d9a441]/40 px-5 text-sm font-semibold text-[#f2c86d] transition hover:bg-[#d9a441]/10 disabled:opacity-50">
            {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileLock2 className="h-4 w-4" />}
            Create private-safe snapshot
          </button>
        ) : null}
        {activeShareUrl ? (
          <button type="button" onClick={() => void copyShareLink()} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-white/80 transition hover:bg-white/8">
            {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy share link"}
          </button>
        ) : null}
        {activeDownloadUrl ? (
          <a href={activeDownloadUrl} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-white/80 transition hover:bg-white/8">
            <Download className="h-4 w-4" /> Download JSON
          </a>
        ) : null}
        {created?.revocationToken ? (
          <button type="button" onClick={() => void copyRevocationToken()} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-white/80 transition hover:bg-white/8">
            {tokenCopied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
            {tokenCopied ? "Token copied" : "Copy revoke token"}
          </button>
        ) : null}
        {created?.revocationToken ? (
          <button type="button" onClick={() => void revokeSnapshot()} disabled={Boolean(busy) || actionsDisabled} className="inline-flex h-11 items-center gap-2 rounded-full border border-red-300/25 px-5 text-sm font-semibold text-red-200 transition hover:bg-red-400/10 disabled:opacity-50">
            {busy === "revoke" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldX className="h-4 w-4" />}
            Revoke
          </button>
        ) : null}
      </div>
      {created ? <p className="mt-3 break-all text-xs text-white/48">Hash: {created.hash}</p> : null}
      <p className="mt-3 text-xs leading-5 text-white/42">Snapshots exclude wallet, strategy, transaction-plan, internal-note, and provider-secret fields by default.</p>
      <div aria-live="polite" className={`mt-2 text-sm ${error ? "text-red-200" : "text-emerald-200"}`}>{error ?? message}</div>
    </div>
  );
}
