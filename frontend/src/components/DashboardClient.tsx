"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAccount } from "wagmi";
import { ArrowRight, Bot, Check, ChevronDown, Newspaper, RadioTower, ShieldCheck, Wallet } from "lucide-react";
import type { PortfolioSnapshot, TokenScanResult } from "@/server/types";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { WalletPortfolioCard } from "@/components/WalletPortfolioCard";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { shortAddress } from "@/lib/format";

const agents = [
  { name: "Portfolio", detail: "Reads holdings, allocation and wallet exposure.", icon: Wallet },
  { name: "News", detail: "Checks market headlines and project catalysts.", icon: Newspaper },
  { name: "Social", detail: "Reviews sentiment, hype quality and warning signals.", icon: RadioTower },
  { name: "Onchain", detail: "Checks contract, liquidity, holders and wallet flows.", icon: ShieldCheck },
  { name: "Execution", detail: "Prepares approval-only transaction plans.", icon: Bot },
];

const networks = [
  { id: "goat", name: "GOAT", mark: "G", color: "bg-[#d9a441] text-black" },
  { id: "ethereum", name: "Ethereum", mark: "E", color: "bg-[#627eea] text-white" },
  { id: "linea", name: "Linea", mark: "L", color: "bg-[#61dfff] text-black" },
  { id: "base", name: "Base", mark: "B", color: "bg-[#0052ff] text-white" },
  { id: "arbitrum", name: "Arbitrum", mark: "A", color: "bg-[#213147] text-white" },
  { id: "bnb", name: "BNB Chain", mark: "B", color: "bg-[#f3ba2f] text-black" },
];

export function DashboardClient() {
  const { address, isConnected } = useAccount();
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [scanQuery, setScanQuery] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState(networks[0]);
  const [isNetworkOpen, setIsNetworkOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<TokenScanResult | null>(null);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);

  useEffect(() => {
    const walletAddress = address ?? "0xDemoWallet";

    fetch(`/api/portfolio?walletAddress=${walletAddress}`)
      .then((response) => response.json())
      .then((data: PortfolioSnapshot) => setPortfolio(data));
  }, [address]);

  if (!portfolio) {
    return <div className="glass-panel rounded-[28px] p-8 text-white/56">Loading portfolio...</div>;
  }

  async function runTokenScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scanQuery.trim()) {
      return;
    }

    setIsScanModalOpen(true);
    setIsScanning(true);
    setScanResult(null);

    const response = await fetch("/api/scan/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: scanQuery.trim(), chain: selectedNetwork.id }),
    });
    const data = (await response.json()) as TokenScanResult;

    setScanResult(data);
    setIsScanning(false);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#d9a441]/20 bg-[#d9a441]/7 p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="text-sm uppercase tracking-[0.2em] text-[#d9a441]">Multi agent dashboard</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Wallet guarded by agents</h1>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-white/58">
              {isConnected ? shortAddress(address) : "Connect wallet to start"}
            </div>
            {!isConnected ? <WalletConnectButton /> : null}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Wallet</div>
        <div className="grid items-stretch gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <WalletPortfolioCard portfolio={portfolio} walletAddress={address} />
          <RiskScoreCard score={portfolio.riskScore} />
        </div>
      </section>

      <section className="rounded-[28px] border border-[#d9a441]/20 bg-[#d9a441]/7 p-5">
        <div className="grid gap-4 lg:grid-cols-[.55fr_1.45fr] lg:items-center">
          <div>
            <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Token scan</div>
            <div className="mt-2 text-xl font-semibold">Contract first</div>
            <div className="mt-2 text-sm text-white/42">Network, social, liquidity</div>
          </div>
          <form onSubmit={runTokenScan} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative sm:w-56">
              <button
                type="button"
                onClick={() => setIsNetworkOpen((isOpen) => !isOpen)}
                className="flex h-12 w-full items-center justify-between gap-3 rounded-full border border-[#d9a441]/35 bg-black/20 px-4 text-sm text-white/76 outline-none transition hover:border-[#d9a441]/60"
              >
                <span className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${selectedNetwork.color}`}>
                    {selectedNetwork.mark}
                  </span>
                  {selectedNetwork.name}
                </span>
                <ChevronDown className={isNetworkOpen ? "h-4 w-4 rotate-180 text-white/48 transition" : "h-4 w-4 text-white/48 transition"} />
              </button>

              {isNetworkOpen ? (
                <div className="absolute left-0 top-14 z-20 w-full overflow-hidden rounded-[22px] border border-white/10 bg-[#101012] py-2 shadow-2xl sm:w-72">
                  {networks.map((network) => (
                    <button
                      key={network.id}
                      type="button"
                      onClick={() => {
                        setSelectedNetwork(network);
                        setIsNetworkOpen(false);
                      }}
                      className="flex h-12 w-full items-center justify-between px-4 text-left text-sm text-white/78 transition hover:bg-white/7"
                    >
                      <span className="flex items-center gap-3">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${network.color}`}>
                          {network.mark}
                        </span>
                        {network.name}
                      </span>
                      {network.id === selectedNetwork.id ? <Check className="h-4 w-4 text-[#d9a441]" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <input
              name="query"
              value={scanQuery}
              onChange={(event) => setScanQuery(event.target.value)}
              placeholder="Contract address"
              className="h-12 min-w-0 flex-1 rounded-full border border-white/10 bg-black/20 px-5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#d9a441]/60"
            />
            <button
              type="submit"
              disabled={isScanning || !scanQuery.trim()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#d9a441] px-5 text-sm font-semibold text-black transition hover:bg-[#f2c86d]"
            >
              {isScanning ? "Scanning" : "Scan token"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>

      <section className="glass-panel rounded-[28px] p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Agents</div>
            <h2 className="mt-2 text-2xl font-semibold">5 agent modules</h2>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {agents.map((agent) => {
            const Icon = agent.icon;

            return (
              <div
                key={agent.name}
                tabIndex={0}
                className="group relative rounded-[22px] border border-white/10 bg-black/20 p-4 outline-none transition hover:border-[#d9a441]/35 focus:border-[#d9a441]/35"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#d9a441]/10 text-[#d9a441]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                </div>
                <div className="mt-4 text-base font-semibold">{agent.name}</div>
                <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-[#050505]/95 px-3 py-2 text-xs leading-5 text-white/64 opacity-0 shadow-2xl transition group-hover:opacity-100 group-focus:opacity-100">
                  {agent.detail}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {isScanModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#101010] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Token scan</div>
                <h2 className="mt-2 text-2xl font-semibold">{scanResult ? scanResult.symbol : "Agents running"}</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsScanModalOpen(false)}
                className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/54 transition hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              {["Social", "Contract", "Liquidity", "Verdict"].map((step, index) => {
                const complete = Boolean(scanResult) || (isScanning && index < 3);

                return (
                  <div key={step} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className={complete ? "h-2 w-2 rounded-full bg-emerald-300" : "h-2 w-2 rounded-full bg-[#d9a441]"} />
                    <div className="mt-4 text-sm font-semibold">{step}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-[#d9a441]/20 bg-[#d9a441]/8 p-4 text-sm text-white/58">
              {scanResult
                ? scanResult.summary
                : `Scanning ${selectedNetwork.name} contract, social sentiment and liquidity signals.`}
            </div>

            {scanResult ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white/6 p-4">
                  <div className="text-sm text-white/42">Risk</div>
                  <div className="mt-1 text-3xl font-semibold text-red-200">{scanResult.overallRiskScore}</div>
                </div>
                <div className="rounded-2xl bg-white/6 p-4">
                  <div className="text-sm text-white/42">Opportunity</div>
                  <div className="mt-1 text-3xl font-semibold text-emerald-200">{scanResult.opportunityScore}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
