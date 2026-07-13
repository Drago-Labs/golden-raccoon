"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useAccount } from "wagmi";
import { ArrowRight, Check, ChevronDown, Loader2 } from "lucide-react";
import type { AgentResult, PortfolioSnapshot, TokenHolding, TokenScanResult } from "@/server/types";
import { AgentResultPanel } from "@/components/AgentResultPanel";
import { NoDataState } from "@/components/NoDataState";
import { RiskScoreCard } from "@/components/RiskScoreCard";
import { WalletPortfolioCard } from "@/components/WalletPortfolioCard";

const networks = [
  { id: "goat", name: "GOAT", mark: "G", color: "bg-[#d9a441] text-black" },
  { id: "ethereum", name: "Ethereum", mark: "E", color: "bg-[#627eea] text-white" },
  { id: "linea", name: "Linea", mark: "L", color: "bg-[#61dfff] text-black" },
  { id: "base", name: "Base", mark: "B", color: "bg-[#0052ff] text-white" },
  { id: "arbitrum", name: "Arbitrum", mark: "A", color: "bg-[#213147] text-white" },
  { id: "bnb", name: "BNB Chain", mark: "B", color: "bg-[#f3ba2f] text-black" },
];

type DashboardAgentKey = "portfolio" | "onchain" | "news" | "social" | "decision";
type DashboardStepStatus = "idle" | "running" | "complete" | "skipped" | "error";

type DashboardRunStep = {
  key: DashboardAgentKey;
  label: string;
  detail: string;
  status: DashboardStepStatus;
};

type DashboardRunSummary = {
  riskyToken?: Pick<TokenHolding, "symbol" | "name" | "tokenAddress" | "chainId" | "chainName" | "riskScore" | "allocationPercent">;
  final?: AgentResult;
  error?: string;
  recordId?: string;
  saveStatus?: "idle" | "saving" | "saved" | "error";
};

const dashboardStepTemplates: Omit<DashboardRunStep, "status">[] = [
  { key: "portfolio", label: "Portfolio", detail: "Wallet exposure" },
  { key: "onchain", label: "Onchain", detail: "Contract and liquidity" },
  { key: "news", label: "News", detail: "Market catalysts" },
  { key: "social", label: "Social", detail: "Hype quality" },
  { key: "decision", label: "Decision", detail: "Final action" },
];

function getInitialDashboardSteps(): DashboardRunStep[] {
  return dashboardStepTemplates.map((step) => ({ ...step, status: "idle" }));
}

function isEvmAddress(value?: string) {
  return Boolean(value?.trim().match(/^0x[a-fA-F0-9]{40}$/));
}

function getRiskiestHolding(holdings: TokenHolding[]) {
  return [...holdings].sort((left, right) => {
    const riskGap = right.riskScore - left.riskScore;

    return riskGap !== 0 ? riskGap : right.allocationPercent - left.allocationPercent;
  })[0];
}

function getStepTone(status: DashboardStepStatus) {
  if (status === "complete") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
  if (status === "running") return "border-[#d9a441]/35 bg-[#d9a441]/10 text-[#f2c86d]";
  if (status === "error") return "border-red-300/25 bg-red-300/10 text-red-200";
  if (status === "skipped") return "border-white/10 bg-white/5 text-white/38";

  return "border-white/10 bg-black/20 text-white/52";
}

function getPortfolioRiskDrivers(portfolio: PortfolioSnapshot) {
  const topHoldings = [...portfolio.holdings].sort((left, right) => right.riskScore - left.riskScore).slice(0, 3);
  const largestHolding = [...portfolio.holdings].sort((left, right) => right.allocationPercent - left.allocationPercent)[0];
  const stableReserve = portfolio.holdings
    .filter((holding) => ["USDC", "USDT", "DAI"].includes(holding.symbol.toUpperCase()))
    .reduce((total, holding) => total + holding.allocationPercent, 0);
  const liquidityExitRisk = portfolio.holdings
    .filter((holding) => holding.signals.liquidityRisk >= 70)
    .reduce((total, holding) => total + holding.allocationPercent, 0);

  return {
    topHoldings,
    largestHolding,
    stableReserve,
    liquidityExitRisk,
    suggestedRebalance:
      portfolio.riskScore >= 70
        ? "Reduce high-risk exposure and increase stable reserve."
        : stableReserve < 10
          ? "Increase stable reserve before taking more token risk."
          : "Monitor current allocation; no urgent rebalance signal.",
  };
}

async function postAgentResult(endpoint: string, body: unknown): Promise<AgentResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${endpoint} failed with ${response.status}`);
  }

  return (await response.json()) as AgentResult;
}

export function DashboardClient() {
  const { address } = useAccount();
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [scanQuery, setScanQuery] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState(networks[0]);
  const [isNetworkOpen, setIsNetworkOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<TokenScanResult | null>(null);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [isDashboardRunOpen, setIsDashboardRunOpen] = useState(false);
  const [isRunningAgents, setIsRunningAgents] = useState(false);
  const [dashboardRunSteps, setDashboardRunSteps] = useState<DashboardRunStep[]>(getInitialDashboardSteps);
  const [dashboardAgentResults, setDashboardAgentResults] = useState<AgentResult[]>([]);
  const [dashboardRunSummary, setDashboardRunSummary] = useState<DashboardRunSummary | null>(null);

  useEffect(() => {
    const query = address ? `?walletAddress=${address}` : "";

    fetch(`/api/portfolio${query}`)
      .then((response) => response.json())
      .then((data: PortfolioSnapshot) => setPortfolio(data));
  }, [address]);

  if (!portfolio) {
    return <NoDataState title="Provider unavailable" detail="Portfolio source has not returned a wallet snapshot yet." action="Not enough connected sources. No mock data used." />;
  }

  const riskDrivers = getPortfolioRiskDrivers(portfolio);

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
      body: JSON.stringify({ query: scanQuery.trim(), chain: selectedNetwork.id, walletAddress: address }),
    });
    const data = (await response.json()) as TokenScanResult;

    setScanResult(data);
    setIsScanning(false);
  }

  async function runDashboardAgents() {
    if (!portfolio) {
      return;
    }

    const walletAddress = address ?? portfolio.walletAddress;

    setIsDashboardRunOpen(true);
    setIsRunningAgents(true);
    setDashboardRunSteps(getInitialDashboardSteps());
    setDashboardAgentResults([]);
    setDashboardRunSummary(null);

    const setStep = (key: DashboardAgentKey, status: DashboardStepStatus, detail?: string) => {
      setDashboardRunSteps((steps) =>
        steps.map((step) => (step.key === key ? { ...step, status, detail: detail ?? step.detail } : step)),
      );
    };

    const pushResult = (result: AgentResult) => {
      setDashboardAgentResults((results) => [...results.filter((item) => item.agent !== result.agent), result]);
    };

    try {
      setStep("portfolio", "running", "Reading wallet");
      const portfolioResult = await postAgentResult("/api/agents/portfolio", { walletAddress });
      pushResult(portfolioResult);
      setStep("portfolio", "complete", portfolioResult.verdict);

      const riskyToken = getRiskiestHolding(portfolio.holdings);
      const specialistTasks: Promise<AgentResult | null>[] = [];

      setDashboardRunSummary({ riskyToken });

      if (riskyToken && isEvmAddress(riskyToken.tokenAddress)) {
        specialistTasks.push(
          (async () => {
            setStep("onchain", "running", riskyToken.symbol);
            try {
              const result = await postAgentResult("/api/agents/onchain", {
                chain: riskyToken.chainId ?? riskyToken.chainName ?? selectedNetwork.id,
                contractAddress: riskyToken.tokenAddress,
              });

              pushResult(result);
              setStep("onchain", "complete", result.verdict);

              return result;
            } catch {
              setStep("onchain", "error", "Source failed");

              return null;
            }
          })(),
        );
      } else {
        setStep("onchain", "skipped", "No EVM contract");
      }

      if (riskyToken) {
        specialistTasks.push(
          (async () => {
            setStep("news", "running", riskyToken.symbol);
            try {
              const result = await postAgentResult("/api/agents/news", {
                tokenName: riskyToken.name,
                symbol: riskyToken.symbol,
                contractAddress: riskyToken.tokenAddress,
              });

              pushResult(result);
              setStep("news", "complete", result.verdict);

              return result;
            } catch {
              setStep("news", "error", "Source failed");

              return null;
            }
          })(),
        );
        specialistTasks.push(
          (async () => {
            setStep("social", "running", riskyToken.symbol);
            try {
              const result = await postAgentResult("/api/agents/social", {
                query: riskyToken.symbol,
                symbol: riskyToken.symbol,
                tokenName: riskyToken.name,
              });

              pushResult(result);
              setStep("social", "complete", result.verdict);

              return result;
            } catch {
              setStep("social", "error", "Source failed");

              return null;
            }
          })(),
        );
      } else {
        setStep("news", "skipped", "No token");
        setStep("social", "skipped", "No token");
      }

      const specialistResults = (await Promise.all(specialistTasks)).filter((result): result is AgentResult => Boolean(result));
      const decisionInputs = [portfolioResult, ...specialistResults];

      setStep("decision", "running", "Combining signals");
      const decisionResult = await postAgentResult("/api/agents/decision", { results: decisionInputs });
      pushResult(decisionResult);
      setStep("decision", "complete", decisionResult.verdict);
      setDashboardRunSummary({ riskyToken, final: decisionResult, saveStatus: "saving" });
      const saveResponse = await fetch("/api/history/agent-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          targetToken: riskyToken
            ? {
                symbol: riskyToken.symbol,
                name: riskyToken.name,
                tokenAddress: riskyToken.tokenAddress,
                chain: riskyToken.chainId ?? riskyToken.chainName,
                riskScore: riskyToken.riskScore,
                allocationPercent: riskyToken.allocationPercent,
              }
            : undefined,
          results: [...decisionInputs, decisionResult],
        }),
      });

      if (!saveResponse.ok) {
        setDashboardRunSummary({ riskyToken, final: decisionResult, saveStatus: "error" });
      } else {
        const saved = (await saveResponse.json()) as { id?: string };

        setDashboardRunSummary({ riskyToken, final: decisionResult, recordId: saved.id, saveStatus: "saved" });
      }
    } catch (error) {
      setDashboardRunSummary({
        error: error instanceof Error ? error.message : "Agent run failed",
      });
      setStep("portfolio", "error", "Run failed");
    } finally {
      setIsRunningAgents(false);
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Portfolio</h1>
        <div className="mt-4 grid items-stretch gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <WalletPortfolioCard portfolio={portfolio} walletAddress={address} />
          <RiskScoreCard score={portfolio.riskScore} holdings={portfolio.holdings} />
        </div>
      </section>

      <section className="flex flex-col gap-3 border-y border-white/10 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/62">{riskDrivers.suggestedRebalance}</div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <span><span className="text-white/38">Largest</span> {riskDrivers.largestHolding?.symbol ?? "N/A"} {riskDrivers.largestHolding?.allocationPercent.toFixed(1) ?? "0.0"}%</span>
          <span><span className="text-white/38">Stable</span> {riskDrivers.stableReserve.toFixed(1)}%</span>
          <span><span className="text-white/38">Exit risk</span> {riskDrivers.liquidityExitRisk.toFixed(1)}%</span>
        </div>
      </section>

      <section className="glass-panel rounded-lg p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Portfolio decision</h2>
            <div className="mt-1 text-sm text-white/46">{dashboardRunSummary?.final ? `${dashboardRunSummary.final.verdict} - ${dashboardRunSummary.final.recommendedAction.replaceAll("_", " ")}` : "Analyze the highest-risk holding."}</div>
          </div>
          <div className="flex gap-2">
            {dashboardAgentResults.length > 0 ? (
              <button
                type="button"
                onClick={() => setIsDashboardRunOpen(true)}
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-semibold text-white/70 transition hover:text-white"
              >
                View result
              </button>
            ) : null}
            <button
              type="button"
              onClick={runDashboardAgents}
              disabled={isRunningAgents}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#d9a441] px-5 text-sm font-semibold text-black transition hover:bg-[#f2c86d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRunningAgents ? "Running" : "Run agents"}
              {isRunningAgents ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#d9a441]/20 bg-[#d9a441]/7 p-5">
        <div className="grid gap-4 lg:grid-cols-[.55fr_1.45fr] lg:items-center">
          <div>
            <div className="text-xl font-semibold">Scan token</div>
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
                <div className="absolute bottom-14 left-0 z-50 max-h-72 w-full overflow-y-auto rounded-[22px] border border-white/10 bg-[#101012] py-2 shadow-2xl sm:w-72">
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

            {scanResult?.dataQuality ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">Data quality</div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs capitalize text-white/54">
                    {scanResult.dataQuality.mode}
                  </span>
                </div>
                <div className="mt-2 text-xs leading-5 text-white/46">{scanResult.dataQuality.detail}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {scanResult.sources.slice(0, 4).map((source) => (
                    <span key={source.label} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/42">
                      {source.label}: {source.status}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isDashboardRunOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#101010] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Agent run</div>
                <h2 className="mt-2 text-2xl font-semibold">
                  {dashboardRunSummary?.final ? dashboardRunSummary.final.verdict : isRunningAgents ? "Agents running" : "Run result"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsDashboardRunOpen(false)}
                className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/54 transition hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-5">
              {dashboardRunSteps.map((step) => (
                <div key={step.key} className={`rounded-2xl border p-4 ${getStepTone(step.status)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">{step.label}</div>
                    {step.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  </div>
                  <div className="mt-3 text-xs leading-5 opacity-75">{step.detail}</div>
                </div>
              ))}
            </div>

            {dashboardRunSummary?.error ? (
              <div className="mt-5 rounded-2xl border border-red-300/20 bg-red-300/10 p-4 text-sm text-red-100">
                {dashboardRunSummary.error}
              </div>
            ) : null}

            {dashboardRunSummary?.riskyToken ? (
              <div className="mt-5 rounded-2xl border border-[#d9a441]/20 bg-[#d9a441]/8 p-4">
                <div className="text-sm text-white/42">Riskiest holding</div>
                <div className="mt-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                  <div>
                    <div className="text-2xl font-semibold">{dashboardRunSummary.riskyToken.symbol}</div>
                    <div className="mt-1 text-sm text-white/46">{dashboardRunSummary.riskyToken.name}</div>
                  </div>
                  <div className="text-sm text-white/54">
                    {dashboardRunSummary.riskyToken.riskScore}/100 risk · {dashboardRunSummary.riskyToken.allocationPercent.toFixed(1)}% allocation
                  </div>
                </div>
              </div>
            ) : null}

            {dashboardRunSummary?.final ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/6 p-4">
                  <div className="text-sm text-white/42">Decision score</div>
                  <div className="mt-1 text-3xl font-semibold">{dashboardRunSummary.final.score}</div>
                </div>
                <div className="rounded-2xl bg-white/6 p-4">
                  <div className="text-sm text-white/42">Action</div>
                  <div className="mt-2 text-lg font-semibold capitalize">{dashboardRunSummary.final.recommendedAction.replaceAll("_", " ")}</div>
                </div>
                <div className="rounded-2xl bg-white/6 p-4">
                  <div className="text-sm text-white/42">Confidence</div>
                  <div className="mt-1 text-3xl font-semibold">{Math.round(dashboardRunSummary.final.confidence * 100)}%</div>
                </div>
              </div>
            ) : null}

            {dashboardRunSummary?.saveStatus ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 p-4 text-sm text-white/52">
                {dashboardRunSummary.saveStatus === "saving"
                  ? "Saving audit record..."
                  : dashboardRunSummary.saveStatus === "saved"
                    ? `Audit record saved${dashboardRunSummary.recordId ? `: ${dashboardRunSummary.recordId}` : "."}`
                    : dashboardRunSummary.saveStatus === "error"
                      ? "Decision finished, but audit record could not be saved."
                      : null}
              </div>
            ) : null}

            {dashboardAgentResults.length === 0 && !isRunningAgents ? (
              <div className="mt-5">
                <NoDataState title="No agent result yet" detail="Run the agent stack to populate score breakdown, sources and missing data." />
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              {dashboardAgentResults.map((result) => (
                <AgentResultPanel key={result.agent} result={result} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
