"use client";

import { useState, useEffect, useCallback } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { DiscoveryCandidate, WatchlistEntry, WatchlistScanRun } from "@/server/types";
import { Plus, Trash2, RefreshCw, Orbit, Wallet, AlertTriangle, Loader2, History } from "lucide-react";

type AssetType = NonNullable<WatchlistEntry["assetType"]>;
type ChainFamily = "evm" | "stellar";

type AddFormState = {
  chainFamily: ChainFamily;
  chain: string;
  assetType: AssetType;
  contractAddress: string;
  pairAddress: string;
  issuer: string;
  assetKey: string;
  symbol: string;
  tokenName: string;
  note: string;
};

type EntryStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "scanning"; entryId: string }
  | { type: "error"; detail: string };

/**
 * Native XLM is a valid add target — it requires a symbol but no contract or issuer.
 * Classic Stellar assets require both CODE:ISSUER. EVM/Soroban contracts require an address.
 */
function symbolValid(form: AddFormState): boolean {
  return Boolean(form.symbol.trim());
}

function nativeValid(form: AddFormState): boolean {
  return form.assetType === "native" && Boolean(form.symbol.trim());
}

function contractValid(form: AddFormState): boolean {
  if (form.assetType === "native" || form.assetType === "classic") return true;
  return Boolean(form.contractAddress.trim());
}

function classicValid(form: AddFormState): boolean {
  if (form.assetType !== "classic") return true;
  return Boolean(form.issuer.trim()) && Boolean(form.assetKey.trim());
}

const defaultForm: AddFormState = {
  chainFamily: "evm",
  chain: "base",
  assetType: "contract",
  contractAddress: "",
  pairAddress: "",
  issuer: "",
  assetKey: "",
  symbol: "",
  tokenName: "",
  note: "",
};

function chipForClassification(classification: WatchlistEntry["latestClassification"] | undefined) {
  if (!classification) return { label: "Pending", tone: "bg-white/10 text-white/55" };
  if (classification === "early_opportunity") return { label: "Early opportunity", tone: "bg-emerald-400/15 text-emerald-200" };
  if (classification === "watch") return { label: "Watch", tone: "bg-sky-400/15 text-sky-200" };
  if (classification === "risky") return { label: "Risky", tone: "bg-amber-400/15 text-amber-200" };

  return { label: "Likely scam", tone: "bg-red-500/15 text-red-200" };
}

function statusChipFor(status: WatchlistScanRun["status"] | undefined) {
  switch (status) {
    case "completed":
      return "text-emerald-200/80";
    case "partial":
      return "text-amber-200/80";
    case "failed":
      return "text-red-200/80";
    case "stale":
      return "text-amber-300/80";
    default:
      return "text-white/45";
  }
}

function chainLabel(chain: string, family: ChainFamily) {
  return family === "stellar" ? "Stellar · " + chain : "EVM · " + chain;
}

function inferFamilyFromChain(chain: string): ChainFamily {
  return chain.toLowerCase().includes("stellar") ? "stellar" : "evm";
}

function assetTypeForFamily(family: ChainFamily): AssetType {
  return family === "stellar" ? "classic" : "contract";
}

function defaultChainForFamily(family: ChainFamily) {
  return family === "stellar" ? "stellar-pubnet" : "base";
}

export function WatchlistClient() {
  const { address, family: walletFamily, isConnected } = useWalletSession();
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [status, setStatus] = useState<EntryStatus>({ type: "loading" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddFormState>(defaultForm);

  const loadEntries = useCallback(async () => {
    if (!address) {
      setEntries([]);
      setStatus({ type: "idle" });
      return;
    }

    setStatus({ type: "loading" });

    try {
      const response = await fetch(`/api/watchlist?walletAddress=${encodeURIComponent(address)}`);

      if (!response.ok) {
        const detail = await response.json().catch(() => ({ detail: "Failed to load." }));
        setStatus({ type: "error", detail: detail.detail ?? detail.error ?? "Failed to load." });
        return;
      }

      const payload = (await response.json()) as { entries?: WatchlistEntry[] };
      setEntries(payload.entries ?? []);
      setStatus({ type: "idle" });
    } catch (error) {
      setStatus({ type: "error", detail: (error as Error).message || "Failed to load." });
    }
  }, [address]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function addEntry() {
    if (!address) return;

    setStatus({ type: "loading" });

    try {
      const payload: Record<string, unknown> = {
        action: "add",
        walletAddress: address,
        chain: form.chain,
        source: form.chainFamily === "stellar" ? "manual_watchlist" : "manual_watchlist",
        symbol: form.symbol.trim() || undefined,
        tokenName: form.tokenName.trim() || undefined,
        note: form.note.trim() || undefined,
        assetType: form.assetType,
      };

      if (form.contractAddress.trim()) payload.contractAddress = form.contractAddress.trim();
      if (form.pairAddress.trim()) payload.pairAddress = form.pairAddress.trim();
      if (form.issuer.trim()) payload.issuer = form.issuer.trim();
      if (form.assetKey.trim()) payload.assetKey = form.assetKey.trim();

      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setForm(defaultForm);
        setShowAddForm(false);
        await loadEntries();
      } else {
        const errorBody = await response.json().catch(() => ({ error: "Failed to add entry" }));
        setStatus({ type: "error", detail: errorBody.detail ?? errorBody.error ?? "Could not add entry." });
      }
    } catch (error) {
      setStatus({ type: "error", detail: (error as Error).message || "Could not add entry." });
    }
  }

  async function removeEntry(id: string) {
    if (!address) return;

    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", entryId: id, walletAddress: address }),
      });

      if (response.ok) {
        setEntries((prev) => prev.filter((entry) => entry.id !== id));
      } else {
        const detail = await response.json().catch(() => ({ detail: "Could not remove." }));
        setStatus({ type: "error", detail: detail.detail ?? detail.error ?? "Could not remove entry." });
      }
    } catch (error) {
      setStatus({ type: "error", detail: (error as Error).message || "Could not remove." });
    }
  }

  async function rescanEntry(entry: WatchlistEntry) {
    if (!address) return;

    setStatus({ type: "scanning", entryId: entry.id });

    try {
      const response = await fetch(`/api/watchlist/${encodeURIComponent(entry.id)}/rescan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });

      const data = (await response.json()) as {
        entry?: WatchlistEntry;
        error?: string;
        detail?: string;
      };

      if (response.ok && data.entry) {
        setEntries((prev) => prev.map((existing) => (existing.id === entry.id ? data.entry! : existing)));
        await loadEntries();
        setStatus({ type: "idle" });
      } else {
        if (data.entry) {
          setEntries((prev) => prev.map((existing) => (existing.id === entry.id ? data.entry! : existing)));
        }
        setStatus({ type: "error", detail: data.detail ?? data.error ?? "Rescan failed." });
      }
    } catch (error) {
      setStatus({ type: "error", detail: (error as Error).message || "Rescan failed." });
    }
  }

  const chainFamily = walletFamily === "stellar" ? "stellar" : "evm";

  return (
    <div className="space-y-8">
      {/* ─── Header ─── */}
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-[#d9a441]">Asset watchlist</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Watchlist</h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Track EVM tokens and Stellar assets. Each entry is wallet-scoped, identity-keyed, and rescannable.
          </p>
        </div>
        {isConnected ? (
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#d9a441] px-5 text-sm font-semibold text-black transition hover:bg-[#f2c86d]"
          >
            <Plus className="h-4 w-4" />
            {showAddForm ? "Cancel" : "Add asset"}
          </button>
        ) : null}
      </section>

      {/* ─── Add form ─── */}
      {showAddForm ? (
        <section className="rounded-[28px] border border-[#d9a441]/25 bg-[#d9a441]/8 p-6">
          <div className="text-sm font-semibold">Add to watchlist</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs text-white/45">Chain</label>
              <input
                type="text"
                value={form.chain}
                onChange={(event) => {
                  const nextChain = event.target.value;
                  const nextFamily = inferFamilyFromChain(nextChain);
                  setForm({ ...form, chain: nextChain, chainFamily: nextFamily });
                }}
                placeholder="base · stellar-pubnet"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50"
              />
            </div>
            <div>
              <label className="block text-xs text-white/45">Asset Type</label>
              <select
                value={form.assetType}
                onChange={(event) => setForm({ ...form, assetType: event.target.value as AssetType })}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50"
              >
                <option value="contract">EVM / Soroban contract</option>
                <option value="classic">Stellar classic (CODE:ISSUER)</option>
                <option value="native">Stellar native (XLM)</option>
                <option value="issuer_account">Issuer account</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/45">Contract address</label>
              <input
                type="text"
                value={form.contractAddress}
                onChange={(event) => setForm({ ...form, contractAddress: event.target.value })}
                placeholder="0x… or C…"
                disabled={form.assetType === "native"}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50 disabled:opacity-40"
              />
            </div>
            <div>
              <label className="block text-xs text-white/45">Issuer (Stellar classic)</label>
              <input
                type="text"
                value={form.issuer}
                onChange={(event) => setForm({ ...form, issuer: event.target.value })}
                placeholder="G…"
                disabled={form.assetType !== "classic"}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50 disabled:opacity-40"
              />
            </div>
            <div>
              <label className="block text-xs text-white/45">Stellar asset code</label>
              <input
                type="text"
                value={form.assetKey}
                onChange={(event) => setForm({ ...form, assetKey: event.target.value })}
                placeholder="USDC"
                disabled={form.assetType !== "classic"}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50 disabled:opacity-40"
              />
            </div>
            <div>
              <label className="block text-xs text-white/45">Pair address (optional)</label>
              <input
                type="text"
                value={form.pairAddress}
                onChange={(event) => setForm({ ...form, pairAddress: event.target.value })}
                placeholder="0x…"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50"
              />
            </div>
            <div>
              <label className="block text-xs text-white/45">Symbol</label>
              <input
                type="text"
                value={form.symbol}
                onChange={(event) => setForm({ ...form, symbol: event.target.value })}
                placeholder="e.g. MEME"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50"
              />
            </div>
            <div>
              <label className="block text-xs text-white/45">Token name (optional)</label>
              <input
                type="text"
                value={form.tokenName}
                onChange={(event) => setForm({ ...form, tokenName: event.target.value })}
                placeholder="e.g. Meme Token"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50"
              />
            </div>
            <div>
              <label className="block text-xs text-white/45">Note (optional)</label>
              <input
                type="text"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                placeholder="Why are you tracking this?"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void addEntry()}
              disabled={
                !symbolValid(form) ||
                !contractValid(form) ||
                !classicValid(form)
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#d9a441] px-5 text-sm font-semibold text-black transition hover:bg-[#f2c86d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add to watchlist
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...defaultForm, chainFamily, chain: defaultChainForFamily(chainFamily), assetType: assetTypeForFamily(chainFamily) })}
              className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 px-5 text-sm font-medium text-white/60 transition hover:border-white/30 hover:text-white/90"
            >
              Reset
            </button>
          </div>
        </section>
      ) : null}

      {/* ─── Not connected ─── */}
      {!isConnected ? (
        <section className="glass-panel rounded-[28px] p-10 text-center">
          <Wallet className="mx-auto h-10 w-10 text-white/20" />
          <div className="mt-4 text-lg font-semibold">Connect your wallet</div>
          <div className="mt-1 text-sm text-white/45">A wallet must be connected to manage watchlist entries.</div>
        </section>
      ) : status.type === "loading" && entries.length === 0 ? (
        <section className="glass-panel rounded-[28px] p-10 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-white/20" />
          <div className="mt-3 text-sm text-white/45">Loading watchlist…</div>
        </section>
      ) : entries.length === 0 ? (
        <section className="glass-panel rounded-[28px] p-10 text-center">
          <Orbit className="mx-auto h-10 w-10 text-white/20" />
          <div className="mt-4 text-lg font-semibold">Empty watchlist</div>
          <div className="mt-1 text-sm text-white/45">
            Add EVM tokens or Stellar assets to start tracking them. Entries are scoped to your wallet.
          </div>
        </section>
      ) : (
        <div className="grid gap-4">
          {entries.map((entry) => {
            const isScanning = status.type === "scanning" && status.entryId === entry.id;
            const entryFamily: ChainFamily = inferFamilyFromChain(entry.chain);
            const staleOrPending = !entry.lastScannedAt || entry.latestStatus === "stale" || entry.latestStatus === "failed";
            const classification = chipForClassification(entry.latestClassification);

            return (
              <div
                key={entry.id}
                className={`rounded-[24px] border p-5 transition ${staleOrPending ? "border-amber-400/20 bg-amber-500/5" : "border-white/10 bg-white/6"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">
                        {entry.chain.startsWith("stellar") ? "✦" : entry.chain.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">{entry.symbol ?? "—"}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${classification.tone}`}>
                            {classification.label}
                          </span>
                          {entry.latestScore !== undefined ? (
                            <span className="text-xs text-white/55">Score: {entry.latestScore}</span>
                          ) : null}
                        </div>
                        <div className="text-xs text-white/40">
                          {(entry.tokenName ?? entry.symbol ?? "") + " · "}
                          {chainLabel(entry.chain, entryFamily)}
                          {(entry.identityKey ?? "").length > 0 ? " · " + entry.identityKey.slice(0, 28) + "…" : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/35">
                      <span className={`font-medium ${statusChipFor(entry.latestStatus)}`}>
                        {entry.latestStatus ?? "not yet scanned"}
                      </span>
                      {entry.lastScannedAt ? (
                        <span>Last scan {new Date(entry.lastScannedAt).toLocaleDateString()}</span>
                      ) : null}
                      {staleOrPending ? (
                        <span className="flex items-center gap-1 text-amber-300/70">
                          <AlertTriangle className="h-3 w-3" />
                          Stale — rescan
                        </span>
                      ) : null}
                      {entry.latestScanRunId ? (
                        <span className="flex items-center gap-1 text-white/30">
                          <History className="h-3 w-3" />
                          run {entry.latestScanRunId.slice(0, 12)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void rescanEntry(entry)}
                      disabled={isScanning}
                      title="Rescan"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      {isScanning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeEntry(entry.id)}
                      title="Remove"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white/50 transition hover:bg-red-500/10 hover:text-red-200"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Error toast ─── */}
      {status.type === "error" ? (
        <div className="fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-2xl border border-red-300/20 bg-[#1a1010] px-5 py-4 shadow-2xl">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-200" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-red-100">Watchlist error</div>
            <div className="mt-0.5 text-xs text-red-200/70">{status.detail}</div>
          </div>
          <button type="button" onClick={() => setStatus({ type: "idle" })} className="text-white/30 hover:text-white/60">
            <span className="text-sm">×</span>
          </button>
        </div>
      ) : null}

      {/* ─── Scan status indicator ─── */}
      {status.type === "scanning" ? (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-3 rounded-2xl border border-[#d9a441]/25 bg-[#1a1810] px-5 py-4 shadow-2xl">
          <Loader2 className="h-4 w-4 animate-spin text-[#d9a441]" />
          <div className="text-sm text-[#f2c86d]">Rescanning…</div>
        </div>
      ) : null}
    </div>
  );
}
