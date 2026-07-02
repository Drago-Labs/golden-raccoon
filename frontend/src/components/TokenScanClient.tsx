"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import type { TokenScanResult } from "@/server/types";
import { RiskBreakdownCard } from "@/components/RiskBreakdownCard";

const checks = ["Social", "Contract", "Liquidity", "Verdict"];
const chains = [
  { value: "base", label: "Base" },
  { value: "bsc", label: "BNB" },
  { value: "ethereum", label: "Ethereum" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "polygon", label: "Polygon" },
  { value: "linea", label: "Linea" },
];

function formatUsd(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1 ? 0 : 6,
  });
}

function formatPercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function TokenScanClient({ initialQuery = "MEME" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery || "MEME");
  const [chain, setChain] = useState("base");
  const [scan, setScan] = useState<TokenScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  async function runScan() {
    setIsScanning(true);
    const response = await fetch("/api/scan/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, chain }),
    });
    const data = (await response.json()) as TokenScanResult;
    setScan(data);
    setIsScanning(false);
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <div className="glass-panel rounded-[28px] p-6">
          <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Token scan</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Token scan</h1>
          <div className="mt-7 grid gap-3 lg:grid-cols-[9rem_1fr_auto]">
            <select
              value={chain}
              onChange={(event) => setChain(event.target.value)}
              className="h-12 rounded-full border border-white/10 bg-white/7 px-4 text-sm text-white outline-none transition focus:border-[#d9a441]/60"
            >
              {chains.map((item) => (
                <option key={item.value} value={item.value} className="bg-[#101010] text-white">
                  {item.label}
                </option>
              ))}
            </select>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="DexScreener URL or contract address"
              className="h-12 min-w-0 flex-1 rounded-full border border-white/10 bg-white/7 px-5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#d9a441]/60"
            />
            <button
              type="button"
              onClick={runScan}
              disabled={isScanning}
              className="h-12 rounded-full bg-[#d9a441] px-6 text-sm font-semibold text-black transition hover:bg-[#f2c86d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isScanning ? "Scanning..." : "Run Scan"}
            </button>
          </div>
          <div className="mt-4 rounded-2xl border border-[#d9a441]/20 bg-[#d9a441]/8 p-4 text-sm text-white/54">
            Deep scan: x402 premium
          </div>
        </div>
        <div className="glass-panel rounded-[28px] p-6">
          <h2 className="text-2xl font-semibold">Checks</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {checks.map((check) => (
              <div key={check} className="flex items-center justify-between rounded-2xl bg-white/6 p-4">
                <span className="text-sm font-medium">{check}</span>
                <span className={scan ? "h-2 w-2 rounded-full bg-emerald-300" : "h-2 w-2 rounded-full bg-[#d9a441]"} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {scan ? (
        <section className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
          <div className="space-y-5">
            <div className="rounded-[28px] border border-red-400/20 bg-red-500/8 p-6">
              <div className="text-sm uppercase tracking-[0.18em] text-red-200">Scan result</div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-4xl font-semibold">{scan.symbol}</h2>
                  <div className="mt-2 text-sm text-white/48">{scan.chain}</div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-right">
                  <div>
                    <div className="text-5xl font-semibold text-red-200">{scan.overallRiskScore}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-white/42">Risk</div>
                  </div>
                  <div>
                    <div className="text-5xl font-semibold text-emerald-200">{scan.opportunityScore}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-white/42">Opportunity</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="glass-panel rounded-[28px] p-6">
              <h2 className="text-xl font-semibold">Reasons</h2>
              <div className="mt-4 space-y-3">
                {scan.reasons.map((reason) => (
                  <div key={reason} className="rounded-2xl bg-white/6 p-4 text-sm leading-6 text-white/62">
                    {reason}
                  </div>
                ))}
              </div>
            </div>
            {scan.market ? (
              <div className="glass-panel rounded-[28px] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">DexScreener market</h2>
                    <div className="mt-1 text-sm text-white/42">{scan.market.dexId ?? "DEX"} pair data</div>
                  </div>
                  {scan.market.pairUrl ? (
                    <a
                      href={scan.market.pairUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/62 transition hover:text-white"
                    >
                      Open
                    </a>
                  ) : null}
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {[
                    ["Liquidity", formatUsd(scan.market.liquidityUsd)],
                    ["24h volume", formatUsd(scan.market.volume24hUsd)],
                    ["FDV", formatUsd(scan.market.fdvUsd)],
                    ["24h change", formatPercent(scan.market.priceChange24hPercent)],
                    ["Pair age", typeof scan.market.pairAgeDays === "number" ? `${scan.market.pairAgeDays} days` : "N/A"],
                    ["Price", formatUsd(scan.market.priceUsd)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-white/6 p-4">
                      <div className="text-sm text-white/42">{label}</div>
                      <div className="mt-1 text-lg font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-5">
            <RiskBreakdownCard items={scan.riskBreakdown} />
            {scan.dataQuality ? (
              <section className="glass-panel rounded-[28px] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Data quality</h2>
                    <div className="mt-1 text-sm leading-6 text-white/48">{scan.dataQuality.detail}</div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs capitalize text-white/54">
                    {scan.dataQuality.mode}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Connected", scan.dataQuality.connectedSources],
                    ["Unavailable", scan.dataQuality.unavailableSources],
                    ["Mock", scan.dataQuality.mockSources],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-white/6 p-4">
                      <div className="text-sm text-white/42">{label}</div>
                      <div className="mt-1 text-2xl font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <section className="glass-panel rounded-[28px] p-6">
              <h2 className="text-xl font-semibold">Sources checked</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {scan.sources.map((source) => (
                  <div key={source.label} className="rounded-2xl bg-white/6 p-4">
                    <div className="text-sm font-medium">{source.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#d9a441]">{source.status}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-[28px] border border-[#d9a441]/25 bg-[#d9a441]/8 p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-[#d9a441]/12 p-3 text-[#d9a441]">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">x402 premium</div>
                  <h2 className="mt-2 text-xl font-semibold">Deep scan locked</h2>
                  <button
                    type="button"
                    className="mt-5 h-11 rounded-full border border-[#d9a441]/35 px-5 text-sm font-semibold text-[#d9a441]"
                  >
                    Prepare x402 Payment
                  </button>
                </div>
              </div>
            </section>
          </div>
        </section>
      ) : null}
    </div>
  );
}
