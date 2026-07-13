"use client";

import { useState } from "react";
import { ArrowRight, Bot, CheckCircle2, Loader2, Newspaper, RadioTower, ShieldCheck, Wallet, X } from "lucide-react";
import type { AgentResult } from "@/server/types";

type AgentKey = AgentResult["agent"];

type AgentModule = {
  key: AgentKey;
  name: string;
  description: string;
  inputLabel: string;
  placeholder: string;
  defaultValue: string;
  icon: typeof Wallet;
};

const modules: AgentModule[] = [
  {
    key: "portfolio",
    name: "Portfolio Agent",
    description: "Concentration, stable reserve and meme exposure.",
    inputLabel: "Wallet",
    placeholder: "0x wallet address",
    defaultValue: "",
    icon: Wallet,
  },
  {
    key: "news",
    name: "News Agent",
    description: "Catalysts, negative mentions and source quality.",
    inputLabel: "Token",
    placeholder: "GOAT, MEME, project name",
    defaultValue: "GOAT",
    icon: Newspaper,
  },
  {
    key: "social",
    name: "Social Agent",
    description: "Hype quality, shill density and phishing signals.",
    inputLabel: "Query",
    placeholder: "$GOAT, handle or hashtag",
    defaultValue: "$GOAT",
    icon: RadioTower,
  },
  {
    key: "onchain",
    name: "Onchain Agent",
    description: "Contract risk, permissions and liquidity checks.",
    inputLabel: "Contract",
    placeholder: "0x contract address",
    defaultValue: "",
    icon: ShieldCheck,
  },
  {
    key: "decision",
    name: "Decision Agent",
    description: "Combines agent results into one recommendation.",
    inputLabel: "Mode",
    placeholder: "balanced",
    defaultValue: "balanced",
    icon: CheckCircle2,
  },
  {
    key: "execution",
    name: "Execution Agent",
    description: "Creates approval-only transaction plans.",
    inputLabel: "Action",
    placeholder: "reduce_exposure",
    defaultValue: "reduce_exposure",
    icon: Bot,
  },
];

function buildRequestBody(agent: AgentKey, value: string, results: Partial<Record<AgentKey, AgentResult>>) {
  if (agent === "portfolio") {
    return { walletAddress: value || undefined };
  }

  if (agent === "news") {
    return { symbol: value || "GOAT" };
  }

  if (agent === "social") {
    return { query: value || "$GOAT" };
  }

  if (agent === "onchain") {
    return { chain: "goat", contractAddress: value };
  }

  if (agent === "decision") {
    return { results: Object.values(results) };
  }

  return { action: value || "reduce_exposure", percent: 30 };
}

export function AgentsNetwork() {
  const [inputs, setInputs] = useState<Record<AgentKey, string>>(() =>
    modules.reduce(
      (state, module) => ({
        ...state,
        [module.key]: module.defaultValue,
      }),
      {} as Record<AgentKey, string>
    )
  );
  const [loading, setLoading] = useState<Partial<Record<AgentKey, boolean>>>({});
  const [results, setResults] = useState<Partial<Record<AgentKey, AgentResult>>>({});
  const [selectedResult, setSelectedResult] = useState<AgentResult | null>(null);
  const completedCount = Object.keys(results).length;
  const warningCount = Object.values(results).filter((result) => result?.status === "warning").length;
  const selectedCriticalBlockers = selectedResult
    ? [
        ...selectedResult.blockingReasons,
        ...selectedResult.findings.filter((finding) => finding.severity === "critical").map((finding) => `${finding.label}: ${finding.detail}`),
      ].slice(0, 4)
    : [];

  async function runAgent(agent: AgentKey) {
    setLoading((current) => ({ ...current, [agent]: true }));

    try {
      const response = await fetch(`/api/agents/${agent}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(agent, inputs[agent], results)),
      });

      if (!response.ok) {
        throw new Error(`Agent request failed with ${response.status}`);
      }

      const result = (await response.json()) as AgentResult;
      setResults((current) => ({ ...current, [agent]: result }));
    } finally {
      setLoading((current) => ({ ...current, [agent]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex items-end justify-between gap-4 border-b border-white/10 pb-4">
        <h1 className="text-3xl font-semibold tracking-tight">Agents</h1>
        <div className="text-sm text-white/46">{completedCount} run · {warningCount} warnings</div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;
          const result = results[module.key];
          const isLoading = Boolean(loading[module.key]);

          return (
            <article key={module.key} className="flex flex-col rounded-lg border border-white/10 bg-white/[.045] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#d9a441]/10 text-[#d9a441]">
                  <Icon className="h-5 w-5" />
                </div>
                <span className={result?.status === "warning" ? "rounded-full bg-[#d9a441]/15 px-3 py-1 text-xs text-[#f2c86d]" : "rounded-full bg-white/7 px-3 py-1 text-xs text-white/46"}>
                  {isLoading ? "running" : result?.status ?? "idle"}
                </span>
              </div>

              <h2 className="mt-4 text-base font-semibold">{module.name}</h2>

              <label className="mt-4 text-xs text-white/34" htmlFor={`${module.key}-input`}>
                {module.inputLabel}
              </label>
              <input
                id={`${module.key}-input`}
                value={inputs[module.key]}
                onChange={(event) => setInputs((current) => ({ ...current, [module.key]: event.target.value }))}
                placeholder={module.placeholder}
                className="mt-2 h-11 rounded-full border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-white/26 focus:border-[#d9a441]/50"
              />

              <button
                type="button"
                onClick={() => void runAgent(module.key)}
                disabled={isLoading}
                className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#d9a441] px-4 text-sm font-semibold text-black transition hover:bg-[#f2c86d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Run
              </button>

              <div className="mt-3">
                {result ? (
                  <button
                    type="button"
                    onClick={() => setSelectedResult(result)}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-[#d9a441]/35"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">{result.verdict}</div>
                      <div className="text-sm text-white/44">{result.score}/100</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/40">
                      <span>{result.riskLevel} risk</span>
                      <span>{Math.round(result.confidence * 100)}% confidence</span>
                      {result.recommendedAction === "manual_review" ? <span>manual review</span> : null}
                    </div>
                    <p className="mt-2 line-clamp-1 text-sm text-white/46">{result.summary}</p>
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>

      {selectedResult ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm">
          <section className="w-full max-w-3xl rounded-[28px] border border-white/10 bg-[#101010] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">{selectedResult.agent} agent</div>
                <h2 className="mt-2 text-3xl font-semibold">{selectedResult.verdict}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/52">{selectedResult.summary}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedResult(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:text-white"
                aria-label="Close result detail"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/[.055] p-4">
                <div className="text-sm text-white/42">Risk</div>
                <div className="mt-1 text-3xl font-semibold">{selectedResult.score}</div>
                <div className="mt-1 text-xs capitalize text-white/38">{selectedResult.riskLevel}</div>
              </div>
              <div className="rounded-2xl bg-white/[.055] p-4">
                <div className="text-sm text-white/42">Confidence</div>
                <div className="mt-1 text-3xl font-semibold">{Math.round(selectedResult.confidence * 100)}%</div>
              </div>
              <div className="rounded-2xl bg-white/[.055] p-4">
                <div className="text-sm text-white/42">Action</div>
                <div className="mt-2 text-sm font-semibold">{selectedResult.recommendedAction.replaceAll("_", " ")}</div>
              </div>
            </div>

            {selectedCriticalBlockers.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-red-300/25 bg-red-500/10 p-4">
                <div className="text-sm font-semibold text-red-100">Critical blockers</div>
                <div className="mt-2 space-y-2">
                  {selectedCriticalBlockers.map((item) => (
                    <div key={item} className="text-sm leading-6 text-red-100/78">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedResult.recommendedAction === "manual_review" ? (
              <div className="mt-4 rounded-2xl border border-[#d9a441]/25 bg-[#d9a441]/10 p-4 text-sm leading-6 text-[#f2c86d]">
                Manual review is required. Review blockers, missing data, source freshness and confidence before taking action.
              </div>
            ) : null}

            {selectedResult.dataQuality ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.045] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">Data quality</div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs capitalize text-white/54">
                    {selectedResult.dataQuality.mode}
                  </span>
                </div>
                <div className="mt-2 text-sm leading-6 text-white/48">{selectedResult.dataQuality.detail}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-black/20 p-3 text-sm text-white/52">Connected: {selectedResult.dataQuality.connectedSources}</div>
                  <div className="rounded-xl bg-black/20 p-3 text-sm text-white/52">Unavailable: {selectedResult.dataQuality.unavailableSources}</div>
                  <div className="rounded-xl bg-black/20 p-3 text-sm text-white/52">Mock: {selectedResult.dataQuality.mockSources}</div>
                </div>
                {selectedResult.dataQuality.mockSources > 0 ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/52">
                    Demo/mock data is visible here and should not be treated as live production evidence.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div>
                <div className="text-sm uppercase tracking-[0.16em] text-white/34">Findings</div>
                <div className="mt-3 space-y-2">
                  {selectedResult.findings.map((finding) => (
                    <div key={`${finding.label}-${finding.detail}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{finding.label}</div>
                        <div className="text-xs text-white/38">{finding.severity}</div>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-white/48">{finding.detail}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm uppercase tracking-[0.16em] text-white/34">Missing data</div>
                <div className="mt-3 space-y-2">
                  {selectedResult.missingData.length > 0 ? (
                    selectedResult.missingData.map((item) => (
                      <div key={`${item.field}-${item.reason}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">{item.field}</div>
                          <div className="text-xs text-white/38">{item.impact}</div>
                        </div>
                        <div className="mt-2 text-sm leading-6 text-white/48">{item.reason}</div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/44">No material missing data reported.</div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm uppercase tracking-[0.16em] text-white/34">Sources</div>
                <div className="mt-3 space-y-2">
                  {selectedResult.sources.map((source) => (
                    <div key={`${source.label}-${source.status}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold">{source.label}</div>
                        <div className="text-xs text-white/38">{source.status}</div>
                      </div>
                      {source.detail ? <div className="mt-2 text-sm leading-6 text-white/48">{source.detail}</div> : null}
                      <div className="mt-2 text-xs text-white/34">
                        {source.checkedAt ? `Freshness: checked ${source.checkedAt}` : "Freshness: unknown"}
                        {typeof source.reliability === "number" ? ` · Confidence: ${Math.round(source.reliability * 100)}%` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
