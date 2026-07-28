"use client";

import { useState, useEffect, useCallback } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { WatchlistEntry, TokenScanResult } from "@/server/types";
import { Plus, Trash2, RefreshCw, Orbit, Wallet, AlertTriangle, Loader2 } from "lucide-react";
import { scanNetworks } from "@/lib/scanNetworks";

type AddFormState = {
  assetIdentifier: string;
  network: string;
  chainFamily: "evm" | "stellar";
  assetType: WatchlistEntry["assetType"];
  symbol: string;
  name: string;
};

type EntryStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "scanning"; entryId: string }
  | { type: "error"; detail: string };

const defaultForm: AddFormState = {
  assetIdentifier: "",
  network: "base",
  chainFamily: "evm",
  assetType: "evm_contract",
  symbol: "",
  name: "",
};

export function WatchlistClient() {
  const { address, family, isConnected } = useWalletSession();
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

    const response = await fetch(`/api/watchlist?walletAddress=${encodeURIComponent(address)}`);
    const data = (await response.json()) as WatchlistEntry[];

    setEntries(data);
    setStatus({ type: "idle" });
  }, [address]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function addEntry() {
    if (!address) return;

    setStatus({ type: "loading" });

    const response = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: address,
        ...form,
        name: form.name || form.symbol,
      }),
    });

    if (response.ok) {
      setForm(defaultForm);
      setShowAddForm(false);
      await loadEntries();
    } else {
      const errorBody = await response.json().catch(() => ({ error: "Failed to add entry" }));
      setStatus({ type: "error", detail: errorBody.detail ?? errorBody.error ?? "Could not add entry." });
    }
  }

  async function removeEntry(id: string) {
    const response = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });

    if (response.ok) {
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
    }
  }

  async function rescanEntry(entry: WatchlistEntry) {
    setStatus({ type: "scanning", entryId: entry.id });

    const response = await fetch(`/api/watchlist/${entry.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rescan", walletAddress: address }),
    });

    const data = await response.json() as { entry?: WatchlistEntry; scan?: TokenScanResult; error?: string; detail?: string };

    if (response.ok && data.entry) {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? data.entry! : e)));
      setStatus({ type: "idle" });
    } else {
      // Preserve prior scan data — update with stale status
      if (data.entry) {
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? data.entry! : e)));
      }
      setStatus({ type: "error", detail: data.detail ?? data.error ?? "Rescan failed." });
    }
  }

  const activeNetwork = scanNetworks.find((n) => n.id === form.network);

  return (
    <div className="space-y-8">
      {/* ─── Header ─── */}
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-[#d9a441]">Asset watchlist</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Watchlist</h1>
          <p className="mt-2 max-w-xl text-sm text-white/45">
            Track EVM tokens and Stellar assets. Entries persist per wallet and can be rescanned at any time.
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
              <label className="block text-xs text-white/45">Chain Family</label>
              <select
                value={form.chainFamily}
                onChange={(e) => {
                  const family = e.target.value as "evm" | "stellar";
                  setForm({
                    ...form,
                    chainFamily: family,
                    network: family === "stellar" ? "stellar-pubnet" : "base",
                    assetType: family === "stellar" ? "stellar_classic" : "evm_contract",
                  });
                }}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50"
              >
                <option value="evm">EVM</option>
                <option value="stellar">Stellar</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/45">Network</label>
              <select
                value={form.network}
                onChange={(e) => setForm({ ...form, network: e.target.value })}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50"
              >
                {scanNetworks
                  .filter((n) => form.chainFamily === "stellar" ? n.chainFamily === "stellar" : !n.chainFamily || n.chainFamily === "evm")
                  .map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/45">Asset Type</label>
              <select
                value={form.assetType}
                onChange={(e) => setForm({ ...form, assetType: e.target.value as WatchlistEntry["assetType"] })}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none focus:border-[#d9a441]/50"
              >
                {form.chainFamily === "evm" ? (
                  <option value="evm_contract">EVM Contract</option>
                ) : (
                  <>
                    <option value="stellar_classic">Classic (CODE:ISSUER)</option>
                    <option value="stellar_contract">Soroban Contract (C…)</option>
                    <option value="stellar_native">Native XLM</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/45">
                Asset identifier
                {form.assetType === "stellar_native" ? " (ignored)" : ""}
              </label>
              <input
                type="text"
                value={form.assetIdentifier}
                onChange={(e) => setForm({ ...form, assetIdentifier: e.target.value })}
                disabled={form.assetType === "stellar_native"}
                placeholder={
                  form.assetType === "evm_contract"
                    ? "0x..."
                    : form.assetType === "stellar_classic"
                      ? "CODE:ISSUER"
                      : "C..."
                }
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#d9a441]/50 disabled:opacity-40"
              />
            </div>
            <div>
              <label className="block text-xs text-white/45">Symbol</label>
              <input
                type="text"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="e.g. MEME"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#d9a441]/50"
              />
            </div>
            <div>
              <label className="block text-xs text-white/45">Name (optional)</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Meme Token"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#d9a441]/50"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void addEntry()}
              disabled={!form.symbol || (!form.assetIdentifier && form.assetType !== "stellar_native")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#d9a441] px-5 text-sm font-semibold text-black transition hover:bg-[#f2c86d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add to watchlist
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
            Add EVM tokens or Stellar assets to start tracking them. Entries persist per wallet.
          </div>
        </section>
      ) : (
        /* ─── Entry list ─── */
        <div className="grid gap-4">
          {entries.map((entry) => {
            const networkConfig = scanNetworks.find((n) => n.id === entry.network);
            const isScanning = status.type === "scanning" && status.entryId === entry.id;
            const isStale = entry.latestScanStatus === "stale" || entry.latestScanStatus === "unavailable";

            return (
              <div
                key={entry.id}
                className={`rounded-[24px] border p-5 transition ${isStale ? "border-amber-400/20 bg-amber-500/5" : "border-white/10 bg-white/6"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${networkConfig?.color ?? "bg-white/10 text-white"}`}
                      >
                        {networkConfig?.mark ?? "?"}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold">{entry.symbol}</span>
                          {entry.latestVerdict ? (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                              entry.latestVerdict === "safe" || entry.latestVerdict === "watch"
                                ? "bg-emerald-400/15 text-emerald-200"
                                : entry.latestVerdict === "high_risk" || entry.latestVerdict === "critical"
                                  ? "bg-red-400/15 text-red-200"
                                  : "bg-white/10 text-white/50"
                            }`}>
                              {entry.latestVerdict}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-white/40">
                          {entry.name !== entry.symbol ? `${entry.name} · ` : null}
                          {networkConfig?.name ?? entry.network} · {entry.chainFamily.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/35">
                      <span className="font-mono">{entry.assetIdentifier.slice(0, 24)}…</span>
                      {entry.latestRiskScore !== undefined ? (
                        <span>Risk: {entry.latestRiskScore}/100</span>
                      ) : null}
                      {entry.latestScanAt ? (
                        <span>Scanned {new Date(entry.latestScanAt).toLocaleDateString()}</span>
                      ) : null}
                      {isStale ? (
                        <span className="flex items-center gap-1 text-amber-300/70">
                          <AlertTriangle className="h-3 w-3" />
                          Stale — rescan
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
            <span className="text-sm">&times;</span>
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
