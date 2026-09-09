"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, RefreshCw, Layers } from "lucide-react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { DeadLetterEntry, DeliveryAttemptHistory } from "@/server/types";

export function DeadLetterPanel() {
  const { address, isConnected } = useWalletSession();
  const [depth, setDepth] = useState<number>(0);
  const [items, setItems] = useState<DeadLetterEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayingBulk, setReplayingBulk] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  const fetchDeadLetters = useCallback(async () => {
    if (!address) return;
    try {
      setLoading(true);
      const res = await fetch("/api/alerts/deliveries/dead-letter", {
        cache: "no-store",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setDepth(data.depth ?? 0);
        setItems(data.items ?? []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      void fetchDeadLetters();
    }
  }, [isConnected, address, fetchDeadLetters]);

  async function handleSingleReplay(deliveryId: string) {
    setReplayingId(deliveryId);
    setNotification(null);
    try {
      const res = await fetch(`/api/alerts/deliveries/${encodeURIComponent(deliveryId)}/replay`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        setNotification(`Successfully replayed delivery ${deliveryId}.`);
        await fetchDeadLetters();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setNotification(`Replay failed: ${errorData.error ?? "Unknown error"}`);
      }
    } catch {
      setNotification("Failed to contact replay endpoint.");
    } finally {
      setReplayingId(null);
    }
  }

  async function handleBulkReplay() {
    setReplayingBulk(true);
    setNotification(null);
    try {
      const res = await fetch("/api/alerts/deliveries/dead-letter", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        const data = await res.json();
        setNotification(
          `Replayed ${data.replayedCount} deliveries: ${data.succeeded} succeeded, ${data.failed} failed.`,
        );
        await fetchDeadLetters();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setNotification(`Bulk replay failed: ${errorData.error ?? "Unknown error"}`);
      }
    } catch {
      setNotification("Failed to contact bulk replay endpoint.");
    } finally {
      setReplayingBulk(false);
    }
  }

  if (!isConnected || depth === 0) {
    return null;
  }

  return (
    <article className="glass-panel rounded-2xl border border-red-400/25 bg-red-950/20 p-4 text-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-red-400/15 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-400/30 bg-red-400/10 text-red-300">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Dead-Letter Queue</h3>
            <p className="text-[11px] text-white/58">
              {depth} delivery failure{depth === 1 ? "" : "s"} exhausted retries and await operator replay.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || replayingBulk}
            onClick={() => void fetchDeadLetters()}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 text-[11px] text-white/72 transition hover:text-white"
            title="Refresh dead-letter queue"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            disabled={replayingBulk || items.length === 0}
            onClick={() => void handleBulkReplay()}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/15 px-3 text-[11px] font-medium text-red-200 transition hover:bg-red-400/25"
          >
            <RotateCcw className={`h-3 w-3 ${replayingBulk ? "animate-spin" : ""}`} />
            {replayingBulk ? "Replaying All…" : `Replay All (${depth})`}
          </button>
        </div>
      </header>

      {notification ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/82">
          {notification}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {items.map((entry) => (
          <DeadLetterItem
            key={entry.deliveryId}
            entry={entry}
            isReplaying={replayingId === entry.deliveryId}
            onReplay={() => void handleSingleReplay(entry.deliveryId)}
          />
        ))}
      </div>
    </article>
  );
}

function DeadLetterItem({
  entry,
  isReplaying,
  onReplay,
}: {
  entry: DeadLetterEntry;
  isReplaying: boolean;
  onReplay: () => void;
}) {
  const [showAttempts, setShowAttempts] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-red-400/25 bg-red-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-300">
              {entry.channel}
            </span>
            <span className="font-mono text-[11px] text-white/72">{entry.deliveryId}</span>
            {entry.replayCount && entry.replayCount > 0 ? (
              <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
                replayed {entry.replayCount}x
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 truncate text-[11px] text-red-200/90" title={entry.reason}>
            {entry.reason}
          </p>
          <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-white/46">
            <span>Enqueued: {new Date(entry.enqueuedAt).toLocaleTimeString()}</span>
            {entry.lastReplayedAt ? (
              <span>Last replayed: {new Date(entry.lastReplayedAt).toLocaleTimeString()}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {entry.attempts && entry.attempts.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowAttempts(!showAttempts)}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 text-[10px] text-white/64 hover:text-white"
            >
              <Layers className="h-3 w-3" />
              {entry.attempts.length} attempt{entry.attempts.length === 1 ? "" : "s"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={isReplaying}
            onClick={onReplay}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 text-[11px] font-medium text-white transition hover:bg-white/20"
          >
            <RotateCcw className={`h-3 w-3 ${isReplaying ? "animate-spin" : ""}`} />
            {isReplaying ? "Replaying…" : "Replay"}
          </button>
        </div>
      </div>

      {showAttempts && entry.attempts && entry.attempts.length > 0 ? (
        <div className="mt-2.5 border-t border-white/10 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-white/46">Attempt History</div>
          <div className="mt-1 space-y-1">
            {entry.attempts.map((attempt) => (
              <AttemptRow key={attempt.attemptNumber} attempt={attempt} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: DeliveryAttemptHistory }) {
  const isDelivered = attempt.status === "delivered";
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-2 py-1 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="font-mono text-white/64">#{attempt.attemptNumber}</span>
        {attempt.isReplay ? (
          <span className="rounded bg-amber-400/15 px-1.5 py-0.2 text-[9px] text-amber-200">Replay</span>
        ) : null}
        <span className={isDelivered ? "text-emerald-300" : "text-red-300"}>
          {attempt.status}
        </span>
        {attempt.errorDetail ? (
          <span className="truncate max-w-[240px] text-white/46" title={attempt.errorDetail}>
            {attempt.errorDetail}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-white/46">
        {attempt.durationMs !== undefined ? <span>{attempt.durationMs}ms</span> : null}
        <span>{new Date(attempt.timestamp).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
