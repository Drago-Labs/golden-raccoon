"use client";

import { ArrowLeftRight, Loader2, Search } from "lucide-react";
import { useState, type FormEvent } from "react";

type Props = {
  initialBaseId?: string;
  initialTargetId?: string;
  isLoading: boolean;
  onCompare: (baseId: string, targetId: string) => void;
};

/**
 * Form component allowing research analysts to select, swap, and compare
 * baseline and target snapshot identifiers.
 */
export function SnapshotSelector({ initialBaseId = "", initialTargetId = "", isLoading, onCompare }: Props) {
  const [baseId, setBaseId] = useState(initialBaseId);
  const [targetId, setTargetId] = useState(initialTargetId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!baseId.trim() || !targetId.trim()) return;
    onCompare(baseId.trim(), targetId.trim());
  }

  function handleSwap() {
    const temp = baseId;
    setBaseId(targetId);
    setTargetId(temp);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-[#0d131f]/80 p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr,auto,1fr,auto] md:items-end">
        <div>
          <label htmlFor="baseId" className="block text-xs font-semibold uppercase tracking-wider text-white/60">
            Baseline Snapshot ID
          </label>
          <input
            id="baseId"
            type="text"
            required
            value={baseId}
            onChange={(e) => setBaseId(e.target.value)}
            placeholder="e.g. snap_01j7abc..."
            disabled={isLoading}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 font-mono text-xs text-white placeholder-white/30 focus:border-[#d9a441] focus:outline-none focus:ring-1 focus:ring-[#d9a441] disabled:opacity-50"
          />
        </div>

        <div className="flex justify-center pb-1">
          <button
            type="button"
            onClick={handleSwap}
            disabled={isLoading || (!baseId && !targetId)}
            title="Swap baseline and target"
            aria-label="Swap baseline and target snapshot IDs"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
        </div>

        <div>
          <label htmlFor="targetId" className="block text-xs font-semibold uppercase tracking-wider text-white/60">
            Target Snapshot ID
          </label>
          <input
            id="targetId"
            type="text"
            required
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder="e.g. snap_01j7xyz..."
            disabled={isLoading}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 font-mono text-xs text-white placeholder-white/30 focus:border-[#d9a441] focus:outline-none focus:ring-1 focus:ring-[#d9a441] disabled:opacity-50"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLoading || !baseId.trim() || !targetId.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9a441]/40 bg-[#d9a441]/15 px-5 text-xs font-semibold text-[#f2c86d] transition hover:bg-[#d9a441]/25 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Compare Snapshots
          </button>
        </div>
      </div>
    </form>
  );
}
