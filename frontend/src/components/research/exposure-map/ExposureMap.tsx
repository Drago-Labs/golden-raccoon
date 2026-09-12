"use client";

import { useState } from "react";
import type { ExposureMapResult } from "@/server/research/exposure-map/schema";
import { ExposureGraph } from "./ExposureGraph";
import { DependencyTable } from "./DependencyTable";
import { ConcentrationPanel } from "./ConcentrationPanel";
import { CoveragePanel } from "./CoveragePanel";
import { Network, Table, AlertTriangle, Layers, RefreshCw } from "lucide-react";

type Props = {
  result: ExposureMapResult;
  onRefresh?: () => void;
  isLoading?: boolean;
};

type ViewMode = "graph" | "table";

/**
 * Interactive research workbench for mapping shared issuer, protocol, and underlying exposure across portfolio holdings.
 */
export function ExposureMap({ result, onRefresh, isLoading }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("graph");

  const totalHoldings = result.adaptedHoldings.length;
  const totalValue = result.coverage.totalPortfolioValueUsd;
  const totalEntities =
    result.groupedExposures.byIssuer.length +
    result.groupedExposures.byProtocol.length +
    result.groupedExposures.byUnderlying.length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8" data-testid="exposure-map-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                Portfolio Exposure Map
              </h1>
              <p className="text-sm text-zinc-400">
                Shared issuer, protocol, and underlying dependencies across network holdings
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
              aria-label="Refresh analysis"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          )}

          <div
            role="group"
            aria-label="View mode toggle"
            className="flex items-center rounded-xl border border-zinc-800 bg-zinc-900/60 p-1"
          >
            <button
              type="button"
              onClick={() => setViewMode("graph")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                viewMode === "graph"
                  ? "bg-purple-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              aria-pressed={viewMode === "graph"}
              data-testid="toggle-graph-view"
            >
              <Network className="h-3.5 w-3.5" />
              <span>Graph View</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                viewMode === "table"
                  ? "bg-purple-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
              aria-pressed={viewMode === "table"}
              data-testid="toggle-table-view"
            >
              <Table className="h-3.5 w-3.5" />
              <span>Table View</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-xs text-zinc-400">Portfolio Value</div>
          <div className="mt-1 text-xl font-bold text-zinc-100">
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500">{totalHoldings} holdings evaluated</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-xs text-zinc-400">Concentration (HHI)</div>
          <div className="mt-1 text-xl font-bold text-zinc-100">
            {result.concentration.hhi}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500 capitalize">
            {result.concentration.classification.replace(/_/g, " ")}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-xs text-zinc-400">Known-Value Ratio</div>
          <div className="mt-1 text-xl font-bold text-zinc-100">
            {(result.coverage.knownValueCoverageRatio * 100).toFixed(1)}%
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500 capitalize">
            Status: {result.coverage.coverageStatus}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-xs text-zinc-400">Identified Entities</div>
          <div className="mt-1 text-xl font-bold text-zinc-100">{totalEntities}</div>
          <div className="mt-0.5 text-[10px] text-zinc-500">
            {result.edges.length} active relationships
          </div>
        </div>
      </div>

      {result.cycles.length > 0 && (
        <div
          className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-200"
          data-testid="cycle-warning-banner"
        >
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span>Circular Dependencies Severed ({result.cycles.length})</span>
          </div>
          <p className="mt-1 text-amber-300/80">
            To prevent artificial value inflation, recursive loop edges were severed:
          </p>
          <div className="mt-2 space-y-1 font-mono text-[11px]">
            {result.cycles.map((cycle, idx) => (
              <div key={idx} className="truncate">
                {cycle.severedEdge} ({cycle.path.join(" &rarr; ")})
              </div>
            ))}
          </div>
        </div>
      )}

      {totalHoldings === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400">
            <Layers className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">No Holdings Found</h3>
          <p className="mt-1 text-xs text-zinc-400">
            This wallet has no active token holdings to evaluate for shared exposure.
          </p>
        </div>
      ) : (
        <>
          <div>
            {viewMode === "graph" ? (
              <ExposureGraph
                nodes={result.nodes}
                edges={result.edges}
              />
            ) : (
              <DependencyTable
                issuers={result.groupedExposures.byIssuer}
                protocols={result.groupedExposures.byProtocol}
                underlyings={result.groupedExposures.byUnderlying}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ConcentrationPanel
              concentration={result.concentration}
              issuers={result.groupedExposures.byIssuer}
              protocols={result.groupedExposures.byProtocol}
            />

            <CoveragePanel coverage={result.coverage} />
          </div>
        </>
      )}
    </div>
  );
}
