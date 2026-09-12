"use client";

import type { ConcentrationMetrics, GroupedExposureItem } from "@/server/research/exposure-map/schema";
import { ShieldCheck, ShieldAlert, AlertTriangle, PieChart } from "lucide-react";

type Props = {
  concentration: ConcentrationMetrics;
  issuers: GroupedExposureItem[];
  protocols: GroupedExposureItem[];
};

function getClassificationBadge(classification: ConcentrationMetrics["classification"]) {
  switch (classification) {
    case "well_diversified":
      return {
        label: "Well Diversified",
        icon: ShieldCheck,
        className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      };
    case "moderate_concentration":
      return {
        label: "Moderate Concentration",
        icon: AlertTriangle,
        className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    case "high_concentration":
      return {
        label: "High Concentration",
        icon: ShieldAlert,
        className: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      };
  }
}

/**
 * Renders portfolio concentration metrics including Herfindahl-Hirschman Index, top entity shares, and dominant dependencies.
 */
export function ConcentrationPanel({ concentration, issuers, protocols }: Props) {
  const badge = getClassificationBadge(concentration.classification);
  const BadgeIcon = badge.icon;

  const topDependencies = [...issuers, ...protocols]
    .sort((a, b) => b.exposureUsd - a.exposureUsd)
    .slice(0, 5);

  return (
    <div
      className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 shadow-xl backdrop-blur-md"
      data-testid="concentration-panel"
    >
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <PieChart className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Concentration Risk</h3>
            <p className="text-xs text-zinc-400">Herfindahl-Hirschman Index & Dependencies</p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${badge.className}`}
          role="status"
        >
          <BadgeIcon className="h-3.5 w-3.5" />
          {badge.label}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 text-center">
          <div className="text-xs font-medium text-zinc-400">HHI Score</div>
          <div className="mt-1 text-xl font-bold tracking-tight text-zinc-100" data-testid="hhi-score">
            {concentration.hhi}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500">Max 10,000 pts</div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 text-center">
          <div className="text-xs font-medium text-zinc-400">Top Entity</div>
          <div className="mt-1 text-xl font-bold tracking-tight text-zinc-100">
            {concentration.topEntitySharePercent.toFixed(1)}%
          </div>
          <div className="mt-0.5 truncate text-[10px] text-zinc-500" title={concentration.topEntityName}>
            {concentration.topEntityName || "None"}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 text-center">
          <div className="text-xs font-medium text-zinc-400">Top 3 Aggregate</div>
          <div className="mt-1 text-xl font-bold tracking-tight text-zinc-100">
            {concentration.top3SharePercent.toFixed(1)}%
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500">Combined weight</div>
        </div>
      </div>

      {concentration.dominantEntities.length > 0 && (
        <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-300">
            <ShieldAlert className="h-4 w-4" />
            <span>Dominant Entity Exposure (&gt;25% Portfolio)</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {concentration.dominantEntities.map((entity) => (
              <span
                key={entity}
                className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-200"
              >
                {entity}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Top Shared Dependencies
        </h4>
        <div className="mt-3 space-y-2">
          {topDependencies.length === 0 ? (
            <div className="py-4 text-center text-xs text-zinc-500">No entity relationships mapped</div>
          ) : (
            topDependencies.map((item) => (
              <div
                key={item.entityId}
                className="flex items-center justify-between rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3.5 py-2.5 text-xs transition hover:border-zinc-700"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-200">{item.name}</span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 uppercase">
                    {item.entityType}
                  </span>
                  {item.distinctChains.length > 1 && (
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300 border border-blue-500/20">
                      {item.distinctChains.length} chains
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className="font-semibold text-zinc-100">
                    ${item.exposureUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  <span className="w-12 text-zinc-400">
                    {item.portfolioSharePercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
