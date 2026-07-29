"use client";

import { useState } from "react";

export function WatchlistAddForm({ wallet }: { wallet: string }) {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const body: Record<string, string> = {
      action: "add",
      walletAddress: wallet,
      chain: formData.get("chain") as string,
      source: "manual",
    };

    const input = formData.get("input") as string;
    const chain = formData.get("chain") as string;

    // Detect asset type from input
    if (chain.startsWith("stellar")) {
      const normalized = input.trim();
      if (/^xlm$/i.test(normalized)) {
        body.assetType = "native";
        body.symbol = "XLM";
        body.assetKey = "native";
      } else if (/^[A-Za-z0-9]{1,12}:[A-Za-z0-9]{56}$/.test(normalized)) {
        const [code, issuer] = normalized.split(":");
        body.assetType = "classic";
        body.assetKey = normalized.toUpperCase();
        body.symbol = code.toUpperCase();
        body.issuer = issuer.toUpperCase();
      } else if (/^C[A-Za-z0-9]{55}$/.test(normalized)) {
        // Contract IDs starting with C can be SAC or SEP-41.
        // Default to "sac" (most common); user can override via the asset variant selector.
        const variant = formData.get("stellarVariant") as string;
        body.assetType = variant === "sep41" ? "sep41" : "sac";
        body.contractAddress = normalized.toUpperCase();
        body.assetKey = `contract:${normalized.toUpperCase()}`;
      } else {
        body.assetType = "classic";
        body.assetKey = normalized;
      }
      body.network = chain;
    } else {
      const address = input.trim().toLowerCase();
      if (/^0x[a-f0-9]{40}$/.test(address)) {
        body.contractAddress = address;
        body.assetType = "contract";
      } else {
        body.contractAddress = address;
        body.assetType = "contract";
      }
    }

    // Add symbol/name if provided
    const symbol = formData.get("symbol") as string;
    const tokenName = formData.get("tokenName") as string;
    if (symbol) body.symbol = symbol;
    if (tokenName) body.tokenName = tokenName;

    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (response.ok && data.entry) {
        window.location.href = `/watchlist?wallet=${encodeURIComponent(wallet)}&added=1`;
      } else {
        setError(data.error ?? "Failed to add entry.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
  }

  return (
    <form className="mt-3 space-y-3" onSubmit={handleSubmit}>
      <div className="grid gap-3 md:grid-cols-[1fr_160px_160px]">
        <div>
          <label htmlFor="input" className="mb-1 block text-xs text-slate-400">
            Contract address / CODE:ISSUER / Contract ID / <span className="font-mono">native</span>
          </label>
          <input
            id="input"
            name="input"
            type="text"
            required
            placeholder="0x... or USDC:GA5ZSE... or C... or XLM"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          />
        </div>
        <div>
          <label htmlFor="chain" className="mb-1 block text-xs text-slate-400">
            Chain / Network
          </label>
          <select
            id="chain"
            name="chain"
            required
            defaultValue="base"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          >
            <optgroup label="EVM">
              <option value="ethereum">Ethereum</option>
              <option value="base">Base</option>
              <option value="bsc">BNB Chain</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="polygon">Polygon</option>
              <option value="optimism">Optimism</option>
              <option value="avalanche">Avalanche</option>
              <option value="goat">GOAT Network</option>
              <option value="linea">Linea</option>
              <option value="scroll">Scroll</option>
              <option value="zksync">zkSync Era</option>
              <option value="berachain">Berachain</option>
              <option value="sonic">Sonic</option>
              <option value="unichain">Unichain</option>
              <option value="worldchain">World Chain</option>
              <option value="monad">Monad</option>
              <option value="plasma">Plasma</option>
            </optgroup>
            <optgroup label="Stellar">
              <option value="stellar-public">Stellar Pubnet</option>
              <option value="stellar-testnet">Stellar Testnet</option>
            </optgroup>
          </select>
        </div>
        <div className="flex flex-col justify-end">
          <button
            type="submit"
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            Add to watchlist
          </button>
        </div>
      </div>

      {/* Optional fields row */}
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label htmlFor="symbol" className="mb-1 block text-xs text-slate-400">
            Symbol <span className="text-slate-600">(optional)</span>
          </label>
          <input
            id="symbol"
            name="symbol"
            type="text"
            placeholder="e.g. USDC"
            maxLength={32}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          />
        </div>
        <div>
          <label htmlFor="tokenName" className="mb-1 block text-xs text-slate-400">
            Token name <span className="text-slate-600">(optional)</span>
          </label>
          <input
            id="tokenName"
            name="tokenName"
            type="text"
            placeholder="e.g. USD Coin"
            maxLength={120}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          />
        </div>
        <div id="stellarVariantGroup">
          <label htmlFor="stellarVariant" className="mb-1 block text-xs text-slate-400">
            Asset variant <span className="text-slate-600">(Stellar contracts)</span>
          </label>
          <select
            id="stellarVariant"
            name="stellarVariant"
            defaultValue="sac"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          >
            <option value="sac">SAC (default)</option>
            <option value="sep41">SEP-41</option>
          </select>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </form>
  );
}

export function WatchlistRemoveButton({ entryId, wallet }: { entryId: string; wallet: string }) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (removing) return;
    setRemoving(true);
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", entryId }),
      });
      const data = await response.json();
      if (data.ok) {
        window.location.href = `/watchlist?wallet=${encodeURIComponent(wallet)}&removed=1`;
      }
    } catch {
      setRemoving(false);
    }
  }

  return (
    <button
      onClick={handleRemove}
      disabled={removing}
      className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-1.5 text-xs font-medium text-rose-300/70 transition-colors hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-50"
    >
      {removing ? "Removing…" : "Remove"}
    </button>
  );
}
