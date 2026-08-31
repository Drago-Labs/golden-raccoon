"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StalenessStamp } from "@/components/StalenessStamp";
import { readOfflineState, type OfflineReadOnlyState } from "@/lib/offlineStore";

export default function OfflinePage() {
  const [state, setState] = useState<OfflineReadOnlyState>({ scans: [], portfolios: [] });

  useEffect(() => {
    setState(readOfflineState());
  }, []);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="border-b border-white/10 pb-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d9a441]">Offline</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Read-only stale data</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/56">
            This view is served from the installed application shell. It never treats cached reports, prices, quotes, verdicts, or execution previews as current, and all actions stay disabled until an explicit refresh after reconnection.
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="glass-panel rounded-lg p-5">
            <h2 className="text-xl font-semibold">Last known scans</h2>
            <div className="mt-4 space-y-3">
              {state.scans.map((entry) => (
                <article key={entry.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <StalenessStamp capturedAt={entry.capturedAt} />
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{entry.data.symbol}</div>
                      <div className="text-sm text-white/42">{entry.data.chain} - {entry.source}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold">{entry.data.overallRiskScore}</div>
                      <div className="text-xs text-white/42">stale risk score</div>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/50">{entry.data.summary}</p>
                </article>
              ))}
              {state.scans.length === 0 ? <div className="text-sm text-white/46">No captured scans are available on this device.</div> : null}
            </div>
          </div>

          <div className="glass-panel rounded-lg p-5">
            <h2 className="text-xl font-semibold">Last known portfolios</h2>
            <div className="mt-4 space-y-3">
              {state.portfolios.map((entry) => (
                <article key={entry.id} className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <StalenessStamp capturedAt={entry.capturedAt} />
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm text-white/80">{entry.data.walletAddress}</div>
                      <div className="mt-1 text-sm text-white/42">{entry.data.holdings.length} holdings</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold">{entry.data.riskScore}</div>
                      <div className="text-xs text-white/42">stale portfolio risk</div>
                    </div>
                  </div>
                </article>
              ))}
              {state.portfolios.length === 0 ? <div className="text-sm text-white/46">No captured portfolio snapshots are available on this device.</div> : null}
            </div>
          </div>
        </section>

        <Link href="/" data-offline-allow className="inline-flex rounded-full border border-white/15 px-5 py-2 text-sm text-white/72">
          Back to app shell
        </Link>
      </div>
    </AppShell>
  );
}
