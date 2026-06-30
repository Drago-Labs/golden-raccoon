"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import type { TokenScanResult } from "@/server/types";
import { RiskBreakdownCard } from "@/components/RiskBreakdownCard";

const checks = ["Social", "Contract", "Liquidity", "Verdict"];

export function TokenScanClient({ initialQuery = "MEME" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery || "MEME");
  const [scan, setScan] = useState<TokenScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  async function runScan() {
    setIsScanning(true);
    const response = await fetch("/api/scan/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
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
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Contract scan</h1>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Contract address"
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
          </div>
          <div className="space-y-5">
            <RiskBreakdownCard items={scan.riskBreakdown} />
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
