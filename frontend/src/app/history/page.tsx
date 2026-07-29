"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { TrendChart } from "@/components/TrendChart";
import { AgentScoreTrendCard } from "@/components/AgentScoreTrendCard";
import { DecisionDetailPanel } from "@/components/DecisionDetail";
import { SourceSnapshotList } from "@/components/SourceSnapshotList";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { DecisionDetail as DecisionDetailType, SourceSnapshotDetail } from "@/server/types";

type TabId = "agent-runs" | "trends" | "transactions";

type AgentRunSummary = {
  id: string;
  recommendation: string;
  targetToken?: { symbol?: string; riskScore?: number };
  decisionScore: number;
  confidence: number;
  status: string;
  createdAt: string;
  summary: string;
  mode?: string;
};

type TransactionSummary = {
  hash: string;
  type: string;
  asset: string;
  valueUsd: number;
  status: string;
  network: string;
  explorerUrl?: string;
  decisionId?: string;
  createdAt: string;
};

type TrendData = {
  buyRiskTrend: Array<{ date: string; buyRisk: number; confidence: number; agentScores: Array<{ agent: string; displayName: string; score: number; scoreKind: string; confidence: number }> }>;
  agentTrends: Array<{ agent: string; displayName: string; scoreKind: string; points: Array<{ date: string; score: number; confidence: number; runId: string }> }>;
};

type PaginatedResponse<T> = {
  items: T[];
  nextCursor?: string;
  total: number;
};

function truncateHash(hash: string) {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US");
}

function explorerUrl(hash: string, network: string): string | undefined {
  if (/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return `https://${network === "goat" ? "explorer.goat.network" : "etherscan.io"}/tx/${hash}`;
  }
  if (/^[a-fA-F0-9]{64}$/.test(hash)) {
    return `https://stellar.expert/explorer/${network === "stellar-pubnet" ? "public" : "testnet"}/tx/${hash}`;
  }
  return undefined;
}

export default function HistoryPage() {
  const session = useWalletSession();
  const walletAddress = session.address ?? undefined;

  const [activeTab, setActiveTab] = useState<TabId>("agent-runs");

  const [agentRuns, setAgentRuns] = useState<AgentRunSummary[]>([]);
  const [runsCursor, setRunsCursor] = useState<string | undefined>(undefined);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [txCursor, setTxCursor] = useState<string | undefined>(undefined);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);

  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{ record?: unknown; decisionDetail?: unknown; sourceSnapshots?: unknown[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchAgentRuns = useCallback(async (cursor?: string) => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const params = new URLSearchParams();
      if (walletAddress) params.set("walletAddress", walletAddress);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "20");
      const res = await fetch(`/api/history/agent-runs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PaginatedResponse<AgentRunSummary> = await res.json();
      setAgentRuns(data.items);
      setRunsCursor(data.nextCursor);
      setRunsTotal(data.total);
    } catch (err) {
      setRunsError(err instanceof Error ? err.message : "Failed to load agent runs");
    } finally {
      setRunsLoading(false);
    }
  }, [walletAddress]);

  const fetchTransactions = useCallback(async (cursor?: string) => {
    setTxLoading(true);
    setTxError(null);
    try {
      const params = new URLSearchParams();
      if (walletAddress) params.set("walletAddress", walletAddress);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "20");
      const res = await fetch(`/api/history/transactions?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PaginatedResponse<TransactionSummary> = await res.json();
      setTransactions(data.items);
      setTxCursor(data.nextCursor);
      setTxTotal(data.total);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setTxLoading(false);
    }
  }, [walletAddress]);

  const fetchTrends = useCallback(async () => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const params = new URLSearchParams();
      if (walletAddress) params.set("walletAddress", walletAddress);
      params.set("period", "30");
      const res = await fetch(`/api/history/trends?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TrendData = await res.json();
      setTrendData(data);
    } catch (err) {
      setTrendError(err instanceof Error ? err.message : "Failed to load trends");
    } finally {
      setTrendLoading(false);
    }
  }, [walletAddress]);

  const fetchRunDetail = useCallback(async (runId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);
    try {
      const res = await fetch(`/api/history/agent-runs/${runId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetailData(data);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load run detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "agent-runs") fetchAgentRuns();
    else if (activeTab === "transactions") fetchTransactions();
    else if (activeTab === "trends") fetchTrends();
  }, [activeTab, fetchAgentRuns, fetchTransactions, fetchTrends]);

  useEffect(() => {
    if (expandedRunId) fetchRunDetail(expandedRunId);
    else setDetailData(null);
  }, [expandedRunId, fetchRunDetail]);

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: "agent-runs", label: "Agent Runs", count: runsTotal },
    { id: "trends", label: "Trends" },
    { id: "transactions", label: "Transactions", count: txTotal },
  ];

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">History</h1>
          {!session.isConnected && (
            <div className="rounded-full border border-amber-400/20 bg-amber-400/5 px-3 py-1 text-xs text-amber-300/70">
              Connect a wallet to see your history
            </div>
          )}
        </section>

        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              {tab.label}
              {tab.count != null && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "agent-runs" && (
          <section className="glass-panel rounded-lg p-6">
            <h2 className="mb-4 text-xl font-semibold">Agent Runs</h2>

            {runsError && (
              <div className="mb-4 rounded-lg border border-red-300/20 bg-red-500/5 p-3 text-sm text-red-200/70">
                {runsError}
              </div>
            )}

            {runsLoading && agentRuns.length === 0 ? (
              <div className="py-8 text-center text-sm text-white/42">Loading agent runs...</div>
            ) : agentRuns.length > 0 ? (
              <div className="space-y-3">
                {agentRuns.map((run) => (
                  <div key={run.id}>
                    <button
                      onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/[0.07]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold capitalize">{run.recommendation.replaceAll("_", " ")}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                              run.status === "completed" ? "bg-green-500/15 text-green-300/80" :
                              run.status === "partial" ? "bg-yellow-500/15 text-yellow-300/80" :
                              "bg-red-500/15 text-red-300/80"
                            }`}>{run.status}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-white/42">{run.summary}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-4 text-xs text-white/50">
                          {run.targetToken?.symbol && (
                            <span>{run.targetToken.symbol}{run.targetToken.riskScore != null ? ` ${run.targetToken.riskScore}/100` : ""}</span>
                          )}
                          <span>{run.mode?.replaceAll("_", " ") ?? "unknown"}</span>
                          <span>{run.decisionScore}/100</span>
                          <span>{Math.round(run.confidence * 100)}%</span>
                          <span>{formatDate(run.createdAt)}</span>
                        </div>
                      </div>
                    </button>

                    {expandedRunId === run.id && (
                      <div className="mt-2 space-y-3 pl-4">
                        <DecisionDetailPanel
                          detail={(detailData?.decisionDetail as DecisionDetailType | null) ?? null}
                          loading={detailLoading}
                          error={detailError}
                        />
                        <SourceSnapshotList
                          snapshots={(detailData?.sourceSnapshots as SourceSnapshotDetail[]) ?? []}
                          loading={detailLoading}
                          error={detailError}
                        />
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between pt-3">
                  <div className="text-xs text-white/38">{runsTotal} total run{runsTotal === 1 ? "" : "s"}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchAgentRuns()}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white/80"
                    >
                      First
                    </button>
                    {runsCursor && (
                      <button
                        onClick={() => fetchAgentRuns(runsCursor)}
                        className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white/80"
                      >
                        Next
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-white/42">
                No saved agent runs yet. Run portfolio agents from the dashboard to create the first record.
              </div>
            )}
          </section>
        )}

        {activeTab === "trends" && (
          <section className="space-y-5">
            <TrendChart
              data={trendData?.buyRiskTrend ?? []}
              loading={trendLoading}
              error={trendError}
            />

            <div>
              <h3 className="mb-3 text-sm font-semibold text-white/70">Per-Agent Score Trends</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {trendLoading && trendData === null ? (
                  <div className="col-span-full py-8 text-center text-sm text-white/42">Loading agent trends...</div>
                ) : trendError ? (
                  <div className="col-span-full rounded-lg border border-red-300/20 bg-red-500/5 p-4 text-sm text-red-200/70">{trendError}</div>
                ) : trendData?.agentTrends.length === 0 ? (
                  <div className="col-span-full rounded-lg bg-white/5 p-4 text-sm text-white/42">No agent trend data yet.</div>
                ) : (
                  trendData?.agentTrends.map((agent) => (
                    <AgentScoreTrendCard
                      key={agent.agent}
                      agent={agent.agent}
                      displayName={agent.displayName}
                      scoreKind={agent.scoreKind}
                      points={agent.points}
                    />
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "transactions" && (
          <section className="glass-panel rounded-lg p-6">
            <h2 className="mb-4 text-xl font-semibold">Transactions</h2>

            {txError && (
              <div className="mb-4 rounded-lg border border-red-300/20 bg-red-500/5 p-3 text-sm text-red-200/70">
                {txError}
              </div>
            )}

            {txLoading && transactions.length === 0 ? (
              <div className="py-8 text-center text-sm text-white/42">Loading transactions...</div>
            ) : transactions.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 text-xs uppercase tracking-wider text-white/36">
                  <span>Hash / Asset</span>
                  <span>Type</span>
                  <span>Value</span>
                  <span>Status</span>
                  <span>Time</span>
                </div>
                {transactions.map((tx) => {
                  const url = tx.explorerUrl ?? explorerUrl(tx.hash, tx.network);
                  return (
                    <div
                      key={tx.hash}
                      className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-xs text-blue-400/70 underline underline-offset-2 hover:text-blue-300"
                            >
                              {truncateHash(tx.hash)}
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-white/50">{truncateHash(tx.hash)}</span>
                          )}
                          {tx.decisionId && (
                            <span className="text-xs text-white/30" title={`Decision: ${tx.decisionId}`}>linked</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-white/42">{tx.asset}</div>
                      </div>
                      <span className="text-xs capitalize text-white/60">{tx.type.replaceAll("_", " ")}</span>
                      <span className="text-xs text-white/50">${tx.valueUsd.toLocaleString()}</span>
                      <span className={`text-xs capitalize ${
                        tx.status === "confirmed" ? "text-green-300/80" :
                        tx.status === "failed" ? "text-red-300/80" :
                        "text-yellow-300/80"
                      }`}>{tx.status}</span>
                      <span className="text-xs text-white/42">{formatDate(tx.createdAt)}</span>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between pt-3">
                  <div className="text-xs text-white/38">{txTotal} total transaction{txTotal === 1 ? "" : "s"}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchTransactions()}
                      className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white/80"
                    >
                      First
                    </button>
                    {txCursor && (
                      <button
                        onClick={() => fetchTransactions(txCursor)}
                        className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white/80"
                      >
                        Next
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-white/42">
                No stored transactions yet. Execute a trade to create the first record.
              </div>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
