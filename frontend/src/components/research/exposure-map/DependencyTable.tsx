"use client";

import { useState, useMemo } from "react";
import type { GroupedExposureItem } from "@/server/research/exposure-map/schema";
import { Search, ChevronDown, ChevronRight, Filter } from "lucide-react";

type Props = {
  issuers: GroupedExposureItem[];
  protocols: GroupedExposureItem[];
  underlyings: GroupedExposureItem[];
};

type FilterType = "all" | "issuer" | "protocol" | "underlying";

/**
 * Tabular representation of portfolio dependencies providing equal depth of information as the graph.
 */
export function DependencyTable({ issuers, protocols, underlyings }: Props) {
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const allItems = useMemo(() => {
    return [...issuers, ...protocols, ...underlyings].sort(
      (a, b) => b.exposureUsd - a.exposureUsd
    );
  }, [issuers, protocols, underlyings]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchesType = filterType === "all" || item.entityType === filterType;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        query === "" ||
        item.name.toLowerCase().includes(query) ||
        item.entityId.toLowerCase().includes(query) ||
        (item.category && item.category.toLowerCase().includes(query)) ||
        item.sourceHoldings.some((h) => h.symbol.toLowerCase().includes(query));

      return matchesType && matchesSearch;
    });
  }, [allItems, filterType, searchQuery]);

  const toggleExpand = (entityId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) {
        next.delete(entityId);
      } else {
        next.add(entityId);
      }
      return next;
    });
  };

  return (
    <div
      className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 shadow-xl backdrop-blur-md"
      data-testid="dependency-table"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search dependencies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 py-2 pl-9 pr-4 text-xs text-zinc-100 placeholder-zinc-500 transition focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              aria-label="Search dependencies"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-1">
          <Filter className="ml-2 mr-1 h-3.5 w-3.5 text-zinc-500" />
          {(["all", "issuer", "protocol", "underlying"] as FilterType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                filterType === type
                  ? "bg-purple-600 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
        <table className="w-full text-left text-xs" role="table" aria-label="Exposure dependencies table">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400">
            <tr>
              <th className="py-3 pl-4 pr-2 font-medium">Entity</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium">Category</th>
              <th className="px-3 py-3 text-right font-medium">Total Exposure</th>
              <th className="px-3 py-3 text-right font-medium">Share</th>
              <th className="px-3 py-3 text-right font-medium">Direct</th>
              <th className="px-3 py-3 text-right font-medium">Look-Through</th>
              <th className="py-3 pl-3 pr-4 text-right font-medium">Holdings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 bg-zinc-950/40">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-zinc-500">
                  No matching dependencies found.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const isExpanded = expandedRows.has(item.entityId);
                return (
                  <tr key={item.entityId} className="group transition hover:bg-zinc-900/30">
                    <td colSpan={8} className="p-0">
                      <div
                        onClick={() => toggleExpand(item.entityId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpand(item.entityId);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-expanded={isExpanded}
                        className="grid grid-cols-8 items-center py-3 pl-4 pr-4 cursor-pointer focus:outline-none focus:bg-zinc-900/50"
                      >
                        <div className="flex items-center gap-2 font-semibold text-zinc-100">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                          )}
                          <span>{item.name}</span>
                        </div>

                        <div>
                          <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] uppercase font-semibold text-zinc-300">
                            {item.entityType}
                          </span>
                        </div>

                        <div className="truncate text-zinc-400">
                          {item.category || "-"}
                        </div>

                        <div className="text-right font-semibold text-zinc-100">
                          ${item.exposureUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>

                        <div className="text-right font-medium text-zinc-300">
                          {item.portfolioSharePercent.toFixed(1)}%
                        </div>

                        <div className="text-right text-zinc-400">
                          ${item.directValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>

                        <div className="text-right text-zinc-400">
                          ${item.lookThroughValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>

                        <div className="text-right text-zinc-300">
                          {item.holdingCount} {item.holdingCount === 1 ? "asset" : "assets"}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-zinc-800/80 bg-zinc-900/20 px-8 py-3">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                            Contributing Holdings Breakdown
                          </div>
                          <div className="space-y-1.5">
                            {item.sourceHoldings.map((h) => (
                              <div
                                key={h.assetKey}
                                className="flex items-center justify-between rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-zinc-200">{h.symbol}</span>
                                  <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                    {h.network}
                                  </span>
                                  {h.lookThrough && (
                                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-300 border border-blue-500/20">
                                      look-through
                                    </span>
                                  )}
                                </div>
                                <div className="font-medium text-zinc-200">
                                  ${h.allocatedUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
