"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { Alert, AlertDeliveryChannel, AlertSeverity, AlertStatus } from "@/server/types";
import { useWalletSession } from "@/hooks/useWalletSession";

type EnrichedAlert = Alert & {
  deliverySummary?: {
    delivered: Array<Alert["deliverySummary"] extends { delivered?: Array<infer T> } | undefined ? T : never>;
    failed: Array<{ channel: string; error: string }>;
    skipped: Array<{ channel: string; reason: string }>;
  };
  deliveryCount: number;
  matchingRule?: { triggerType: Alert["triggerType"]; severity: AlertSeverity } | null;
};

type AlertResponse = {
  alerts: EnrichedAlert[];
  counts: { triggered: number; recovered: number; acknowledged: number };
};

const severityTones: Record<AlertSeverity, string> = {
  low: "border-emerald-300/30 bg-emerald-300/8 text-emerald-200",
  medium: "border-[#d9a441]/35 bg-[#d9a441]/10 text-[#f2c86d]",
  high: "border-orange-300/35 bg-orange-300/10 text-orange-200",
  critical: "border-red-300/35 bg-red-400/8 text-red-200",
};

const statusTones: Record<AlertStatus, string> = {
  triggered: "border-red-300/25 bg-red-400/8 text-red-200",
  recovered: "border-emerald-300/25 bg-emerald-300/8 text-emerald-200",
  acknowledged: "border-white/10 bg-white/5 text-white/58",
};

export function AlertHistoryList({ initialData }: { initialData?: AlertResponse }) {
  const { address, isConnected } = useWalletSession();
  const [data, setData] = useState<AlertResponse | null>(initialData ?? null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const walletParam = address ?? "";

  useEffect(() => {
    if (!walletParam) return;
    const controller = new AbortController();

    fetch(`/api/alerts/alerts?walletAddress=${encodeURIComponent(walletParam)}&limit=200`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Failed to load alerts")))
      .then((payload: AlertResponse) => {
        if (!controller.signal.aborted) setData(payload);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError" || controller.signal.aborted) return;
        setError(err.message);
      });

    return () => controller.abort();
  }, [walletParam]);

  async function acknowledge(alertId: string) {
    if (!address) return;
    setBusyId(alertId);
    setError(null);
    const response = await fetch(`/api/alerts/alerts/${alertId}/acknowledge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    });
    setBusyId(null);
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as { error?: string };
      setError(detail.error ?? "Could not acknowledge alert.");
      return;
    }
    setData((current) => current ? {
      ...current,
      alerts: current.alerts.map((alert) => alert.id === alertId ? { ...alert, status: "acknowledged", acknowledgedAt: new Date().toISOString() } : alert),
      counts: { ...current.counts, triggered: Math.max(0, current.counts.triggered - 1), acknowledged: current.counts.acknowledged + 1 },
    } : current);
  }

  if (!isConnected) {
    return (
      <section className="glass-panel rounded-lg border border-white/10 p-5 text-sm text-white/58">
        Connect your wallet to view your alert history.
      </section>
    );
  }

  if (!data) {
    return (
      <section className="glass-panel rounded-lg border border-white/10 p-5 text-sm text-white/58">
        {error ?? "Loading alerts…"}
      </section>
    );
  }

  const recent = data.alerts.slice(0, 30);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Alert history</h2>
          <p className="mt-1 text-sm text-white/46">{data.alerts.length} total alert{data.alerts.length === 1 ? "" : "s"} — newest first.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-red-300/25 bg-red-400/8 px-3 py-1 text-red-200">{data.counts.triggered} triggered</span>
          <span className="rounded-full border border-emerald-300/25 bg-emerald-300/8 px-3 py-1 text-emerald-200">{data.counts.recovered} recovered</span>
          <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-white/58">{data.counts.acknowledged} acknowledged</span>
        </div>
      </header>

      {error ? <p className="text-sm text-red-200">{error}</p> : null}

      <div className="space-y-2">
        {recent.length === 0 ? (
          <div className="glass-panel rounded-lg border border-white/10 p-5 text-sm text-white/58">
            No alerts have been triggered yet for this wallet. Default rules are seeded; future agent runs will evaluate them.
          </div>
        ) : null}
        {recent.map((alert) => {
          const isOpen = expandedId === alert.id;
          const tone = alert.status === "triggered" ? severityTones[alert.severity] : statusTones[alert.status];

          return (
            <article key={alert.id} className={`rounded-2xl border p-4 ${tone}`}>
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : alert.id)}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.14em] opacity-75">
                    <span>{alert.triggerType}</span>
                    <span>·</span>
                    <span>{alert.observationKey || "catch-all"}</span>
                  </div>
                  <h3 className="mt-1 text-base font-semibold">{alert.message}</h3>
                  <div className="mt-1 text-xs opacity-65">
                    {new Date(alert.triggeredAt).toLocaleString()} · {alert.deliverySummary?.delivered?.length ?? 0}/{alert.deliveryCount} channels delivered
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {alert.status === "triggered" ? (
                    <button
                      type="button"
                      disabled={busyId === alert.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void acknowledge(alert.id);
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2.5 text-xs font-medium text-white/72 transition hover:text-white"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Acknowledge
                    </button>
                  ) : null}
                  <ChevronRight className={`h-4 w-4 transition ${isOpen ? "rotate-90" : ""}`} />
                </div>
              </button>

              {isOpen ? (
                <div className="mt-4 space-y-3 border-t border-white/10 pt-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] opacity-55">Before / After</div>
                    <div className="mt-1 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="font-medium text-white/82">Before</div>
                        <p className="mt-1 text-white/58">{alert.evidenceBefore.label} · {alert.evidenceBefore.detail}</p>
                      </div>
                      <div>
                        <div className="font-medium text-white/82">After</div>
                        <p className="mt-1 text-white/58">{alert.evidenceAfter.label} · {alert.evidenceAfter.detail}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] opacity-55">Value</div>
                      <div className="text-sm font-medium text-white/82">{alert.beforeValue} → {alert.afterValue}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] opacity-55">Source hash</div>
                      <div className="text-sm font-mono text-white/72">{alert.evidenceData.sourceSnapshotHashAfter}</div>
                    </div>
                  </div>
                  {alert.deliverySummary ? <DeliverySummary summary={alert.deliverySummary} /> : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DeliverySummary({ summary }: { summary: NonNullable<EnrichedAlert["deliverySummary"]> }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] opacity-55">Delivery</div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/6 p-2 text-emerald-200">
          <div className="text-[10px] opacity-65">Delivered</div>
          <div className="mt-1 text-xs font-semibold">{summary.delivered?.length ? summary.delivered.join(", ") : "—"}</div>
        </div>
        <div className="rounded-xl border border-red-300/20 bg-red-400/6 p-2 text-red-200">
          <div className="text-[10px] opacity-65">Failed</div>
          <div className="mt-1 text-xs">
            {summary.failed?.length ? summary.failed.map((entry) => `${entry.channel}: ${entry.error}`).join("; ") : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/64 lg:col-span-2">
          <div className="text-[10px] opacity-65">Skipped</div>
          <div className="mt-1 text-xs">
            {summary.skipped?.length ? summary.skipped.map((entry) => `${entry.channel}: ${entry.reason}`).join("; ") : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
