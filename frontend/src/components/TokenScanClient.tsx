"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import type { RiskReportVerdict, ScoreFactor, TokenScanResult } from "@/server/types";
import { NoDataState } from "@/components/NoDataState";
import { RiskBreakdownCard } from "@/components/RiskBreakdownCard";

const checks = ["Contract Guard", "Social Scout", "News Oracle", "Decision Core"];
const chains = [
  { value: "base", label: "Base" },
  { value: "goat", label: "GOAT" },
  { value: "bsc", label: "BNB" },
  { value: "ethereum", label: "Ethereum" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "polygon", label: "Polygon" },
  { value: "optimism", label: "Optimism" },
  { value: "solana", label: "Solana later", disabled: true },
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

function findBreakdown(scan: TokenScanResult, labels: string[]) {
  return scan.riskBreakdown.filter((item) => labels.some((label) => item.label.toLowerCase().includes(label) || item.key.toLowerCase().includes(label))).slice(0, 3);
}

function verdictLabel(verdict?: RiskReportVerdict) {
  if (!verdict) return "Manual review";

  return verdict.replaceAll("_", " ");
}

function riskTone(score: number) {
  if (score >= 75) return "border-red-400/25 bg-red-500/10 text-red-100";
  if (score >= 50) return "border-orange-300/25 bg-orange-400/10 text-orange-100";
  if (score >= 25) return "border-[#d9a441]/25 bg-[#d9a441]/10 text-[#f2c86d]";

  return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
}

function factorTone(factor: ScoreFactor) {
  if (factor.severity === "critical") return "border-red-400/25 bg-red-500/12 text-red-100";
  if (factor.severity === "high") return "border-orange-300/20 bg-orange-400/10 text-orange-100";
  if (factor.direction === "risk_decrease") return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";

  return "border-white/8 bg-black/20 text-white/56";
}

function formatMetaValue(value: string | number | boolean | null | undefined) {
  if (value === undefined || value === null || value === "") return "N/A";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toFixed(2);

  return value;
}

function factorMetaEntries(factor: ScoreFactor) {
  return Object.entries(factor.meta ?? {})
    .filter(([, value]) => value !== undefined)
    .slice(0, 4);
}

export function TokenScanClient({ initialQuery = "MEME" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery || "MEME");
  const [chain, setChain] = useState("base");
  const [walletAddress, setWalletAddress] = useState("");
  const [scan, setScan] = useState<TokenScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const report = scan?.riskReport;
  const normalizedInput = report?.input ?? scan?.normalizedInput;

  async function runScan() {
    setIsScanning(true);
    const response = await fetch("/api/scan/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, chain, walletAddress: walletAddress.trim() || undefined }),
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
                <option key={item.value} value={item.value} disabled={item.disabled} className="bg-[#101010] text-white">
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
          <input
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
            placeholder="Optional wallet address for portfolio exposure"
            className="mt-3 h-12 w-full rounded-full border border-white/10 bg-white/7 px-5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#d9a441]/60"
          />
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
            <div className={`rounded-[28px] border p-6 ${riskTone(report?.buyRisk ?? scan.overallRiskScore)}`}>
              <div className="text-sm uppercase tracking-[0.18em] opacity-75">AI Risk Report</div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-4xl font-semibold">{scan.symbol}</h2>
                  <div className="mt-2 text-sm capitalize opacity-70">{verdictLabel(report?.verdict)}</div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-right">
                  <div>
                    <div className="text-5xl font-semibold">{report?.buyRisk ?? scan.overallRiskScore}%</div>
                    <div className="text-xs uppercase tracking-[0.2em] opacity-60">Buy risk</div>
                  </div>
                  <div>
                    <div className="text-5xl font-semibold">{Math.round((report?.confidence ?? 0) * 100)}%</div>
                    <div className="text-xs uppercase tracking-[0.2em] opacity-60">Confidence</div>
                  </div>
                </div>
              </div>
              <p className="mt-5 max-w-2xl text-sm leading-6 opacity-80">{report?.summary ?? scan.summary}</p>
              {normalizedInput ? (
                <div className="mt-5 grid gap-2 text-xs text-white/58 sm:grid-cols-2">
                  <div className="rounded-2xl bg-black/20 p-3">Chain: {normalizedInput.chain}</div>
                  <div className="rounded-2xl bg-black/20 p-3">Source: {normalizedInput.source.replaceAll("_", " ")}</div>
                  <div className="rounded-2xl bg-black/20 p-3">Contract: {normalizedInput.contractAddress ?? "unresolved"}</div>
                  <div className="rounded-2xl bg-black/20 p-3">Pair: {normalizedInput.pairAddress ?? "N/A"}</div>
                </div>
              ) : null}
            </div>
            <div className="glass-panel rounded-[28px] p-6">
              <h2 className="text-xl font-semibold">Top reasons</h2>
              <div className="mt-4 space-y-3">
                {(report?.topReasons.length ? report.topReasons : scan.reasons).map((reason) => (
                  <div key={reason} className="rounded-2xl bg-white/6 p-4 text-sm leading-6 text-white/62">
                    {reason}
                  </div>
                ))}
              </div>
            </div>
            {report?.agentCards.length ? (
              <div className="glass-panel rounded-[28px] p-6">
                <h2 className="text-xl font-semibold">Agent cards</h2>
                <div className="mt-5 grid gap-3">
                  {report.agentCards.map((card) => (
                    <article key={card.agent} className="rounded-2xl bg-white/6 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold">{card.displayName}</div>
                          <div className="mt-1 text-xs capitalize text-white/42">{card.scoreKind} score</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-semibold">{card.score}</div>
                          <div className="text-xs text-white/42">{Math.round(card.confidence * 100)}% conf</div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/54">{card.summary}</p>
                      {card.secondaryScores?.length ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {card.secondaryScores.map((score) => (
                            <div key={`${card.agent}:${score.label}`} className="rounded-xl border border-white/8 bg-black/18 px-3 py-2">
                              <div className="text-xs text-white/42">{score.label}</div>
                              <div className="mt-1 text-xl font-semibold">{score.score}</div>
                              <div className="mt-1 text-[11px] leading-4 text-white/42">{score.detail}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {card.criticalFactors?.length ? (
                        <div className="mt-3 space-y-2">
                          {card.criticalFactors.map((factor) => (
                            <div key={`${card.agent}:critical:${factor.label}`} className={`rounded-xl border px-3 py-2 text-xs leading-5 ${factorTone(factor)}`}>
                              <div className="font-semibold">{factor.label}</div>
                              <div className="mt-1 opacity-80">{factor.detail}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 space-y-2">
                        {card.factors.slice(0, 6).map((factor) => (
                          <div key={`${card.agent}:${factor.category}:${factor.label}`} className={`rounded-xl border px-3 py-2 text-xs leading-5 ${factorTone(factor)}`}>
                            <div className="flex items-start justify-between gap-3">
                              <span className="font-semibold">{factor.label}</span>
                              <span className="shrink-0 opacity-70">{factor.impact > 0 ? "+" : ""}{factor.impact}</span>
                            </div>
                            <div className="mt-1 opacity-80">{factor.detail}</div>
                            {factorMetaEntries(factor).length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {factorMetaEntries(factor).map(([key, value]) => (
                                  <span key={`${card.agent}:${factor.label}:${key}`} className="rounded-full bg-white/8 px-2 py-1 text-[11px] capitalize opacity-75">
                                    {key.replace(/([A-Z])/g, " $1")}: {formatMetaValue(value)}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      {card.missingData.length ? (
                        <div className="mt-3 rounded-xl border border-[#d9a441]/25 bg-[#d9a441]/8 px-3 py-2 text-xs leading-5 text-[#f2c86d]">
                          Missing data: {card.missingData.map((item) => item.field).join(", ")}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="rounded-[28px] border border-[#d9a441]/25 bg-[#d9a441]/8 p-6">
              <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Final decision</div>
              <h2 className="mt-2 text-2xl font-semibold capitalize">{verdictLabel(report?.verdict)}</h2>
              <div className="mt-3 text-sm leading-6 text-white/58">
                Suggested action: {scan.suggestedAction.type.replaceAll("_", " ")}
                {scan.suggestedAction.percent ? ` ${scan.suggestedAction.percent}% ${scan.suggestedAction.fromToken} to ${scan.suggestedAction.toToken}` : ""}
              </div>
              <div className="mt-4 space-y-2">
                {scan.reasons.slice(0, 3).map((reason) => (
                  <div key={reason} className="rounded-2xl bg-black/20 px-4 py-3 text-sm text-white/58">
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
            <section className="glass-panel rounded-[28px] p-6">
              <h2 className="text-xl font-semibold">Why this decision</h2>
              <div className="mt-4 grid gap-3">
                {[
                  ["Onchain blockers", findBreakdown(scan, ["contract", "liquidity", "holder"])],
                  ["News catalysts", findBreakdown(scan, ["news", "catalyst", "regulatory"])],
                  ["Social identity confidence", findBreakdown(scan, ["social", "phishing", "engagement", "xsentiment"])],
                ].map(([label, items]) => (
                  <div key={label as string} className="rounded-2xl bg-white/6 p-4">
                    <div className="text-sm font-semibold">{label as string}</div>
                    <div className="mt-2 space-y-2">
                      {(items as ReturnType<typeof findBreakdown>).length > 0 ? (
                        (items as ReturnType<typeof findBreakdown>).map((item) => (
                          <div key={`${label}:${item.label}`} className="text-xs leading-5 text-white/52">
                            {item.label}: {item.finding}
                          </div>
                        ))
                      ) : (
                        <div className="text-xs leading-5 text-white/42">No connected signal in this category.</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
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
            {scan.dataQuality?.mode === "unavailable" || scan.dataQuality?.connectedSources === 0 ? (
              <NoDataState
                title="Not enough connected sources"
                detail="Provider unavailable or token identity could not be resolved. This result is conservative and uses no mock data."
              />
            ) : null}
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
