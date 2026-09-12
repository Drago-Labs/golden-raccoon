"use client";

import { useState } from "react";
import type {
  ExposureGraphEdge,
  ExposureGraphNode,
} from "@/server/research/exposure-map/schema";
import { Network, Info, ArrowRight } from "lucide-react";

type Props = {
  nodes?: ExposureGraphNode[];
  edges?: ExposureGraphEdge[];
};

/**
 * Visual directed graph component rendering holdings, issuers, protocols, and relationship links.
 */
export function ExposureGraph({ nodes = [], edges = [] }: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const holdingNodes = nodes.filter((n) => n.type === "holding");
  const entityNodes = nodes.filter((n) => n.type !== "holding");

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;

  const connectedEdgeMap = new Map<string, ExposureGraphEdge[]>();
  for (const edge of edges) {
    const fromList = connectedEdgeMap.get(edge.source) || [];
    fromList.push(edge);
    connectedEdgeMap.set(edge.source, fromList);

    const toList = connectedEdgeMap.get(edge.target) || [];
    toList.push(edge);
    connectedEdgeMap.set(edge.target, toList);
  }

  const selectedConnectedEdges = selectedNodeId ? connectedEdgeMap.get(selectedNodeId) || [] : [];
  const selectedConnectedNodeIds = new Set<string>();
  for (const edge of selectedConnectedEdges) {
    selectedConnectedNodeIds.add(edge.source);
    selectedConnectedNodeIds.add(edge.target);
  }

  return (
    <div
      className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 shadow-xl backdrop-blur-md"
      data-testid="exposure-graph"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Exposure Relationship Graph</h3>
            <p className="text-xs text-zinc-400">
              Interactive dependencies linking holdings to issuers, protocols, and underlyings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
            <span>Holdings ({holdingNodes.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
            <span>Entities ({entityNodes.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span>Links ({edges.length})</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-6">
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Portfolio Assets (Holdings)
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {holdingNodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isRelated = selectedConnectedNodeIds.has(node.id);
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-blue-500 bg-blue-500/15 shadow-md shadow-blue-500/10 ring-1 ring-blue-500"
                        : isRelated
                        ? "border-blue-500/60 bg-blue-500/5"
                        : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                    }`}
                    data-testid={`holding-node-${node.symbol || node.name}`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-semibold text-zinc-100">{node.symbol || node.name}</span>
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-400">
                        {node.network}
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-bold text-zinc-200">
                      ${node.directValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {node.portfolioSharePercent.toFixed(1)}% portfolio
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Connected Issuers, Protocols &amp; Underlyings
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {entityNodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isRelated = selectedConnectedNodeIds.has(node.id);
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-purple-500 bg-purple-500/15 shadow-md shadow-purple-500/10 ring-1 ring-purple-500"
                        : isRelated
                        ? "border-purple-500/60 bg-purple-500/5"
                        : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                    }`}
                    data-testid={`entity-node-${node.id}`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-semibold text-zinc-100">{node.name}</span>
                      <span className="rounded bg-purple-900/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-purple-300">
                        {node.type}
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-bold text-zinc-200">
                      ${node.totalExposureUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {node.portfolioSharePercent.toFixed(1)}% total exposure
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-xs font-semibold text-zinc-300">
            <Info className="h-4 w-4 text-zinc-400" />
            <span>Inspection &amp; Provenance</span>
          </div>

          {selectedNode ? (
            <div className="mt-4 space-y-4 text-xs">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Selected Node</span>
                <div className="mt-0.5 text-sm font-bold text-zinc-100">{selectedNode.name}</div>
                <div className="text-[11px] text-zinc-400">ID: {selectedNode.id}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-zinc-900/60 p-2 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500">Type</span>
                  <div className="font-semibold text-zinc-200 capitalize">{selectedNode.type}</div>
                </div>
                <div className="rounded-lg bg-zinc-900/60 p-2 border border-zinc-800">
                  <span className="text-[10px] text-zinc-500">Total Exposure</span>
                  <div className="font-semibold text-zinc-200">
                    ${selectedNode.totalExposureUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {selectedConnectedEdges.length > 0 && (
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Active Relationships ({selectedConnectedEdges.length})
                  </span>
                  <div className="mt-2 space-y-2">
                    {selectedConnectedEdges.map((edge) => (
                      <div
                        key={edge.id}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] font-medium text-zinc-200">
                          <span className="truncate max-w-[120px]">{edge.source}</span>
                          <ArrowRight className="h-3 w-3 text-zinc-500" />
                          <span className="truncate max-w-[120px]">{edge.target}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400">
                          <span className="rounded bg-zinc-800 px-1 py-0.5">{edge.relationship}</span>
                          <span>Weight: {(edge.weight * 100).toFixed(0)}%</span>
                        </div>
                        <div className="text-[9px] text-zinc-500">
                          Provenance: {edge.provenance.source} ({(edge.provenance.confidence * 100).toFixed(0)}% confidence)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-zinc-500">
              Select any asset or entity node to inspect connections, weights, and provenance data.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
