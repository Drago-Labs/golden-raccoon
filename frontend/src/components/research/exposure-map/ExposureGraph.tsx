"use client";

import { useMemo } from "react";
import { fromMicroUsd, type ExposureEdge, type ExposureNode } from "@/server/research/exposure-map/schema";

const KIND_COLUMN: Record<ExposureNode["kind"], number> = {
  holding: 0,
  protocol: 1,
  underlying: 1,
  issuer: 2,
};

const ROW_HEIGHT = 44;
const COLUMN_WIDTH = 230;

/**
 * Layered diagram of the exposure graph.
 *
 * The graph is a presentational companion to the dependency table, never the
 * only way to reach the information: it is `aria-hidden`, and every node and
 * edge it draws also appears as a table row. Dropped edges are drawn dashed and
 * labelled so a cycle is visible without being counted.
 */
export function ExposureGraph({ nodes, edges }: { nodes: ExposureNode[]; edges: ExposureEdge[] }) {
  const layout = useMemo(() => {
    const columns = new Map<number, ExposureNode[]>();

    for (const node of nodes) {
      const column = KIND_COLUMN[node.kind];
      const bucket = columns.get(column);
      if (bucket) bucket.push(node);
      else columns.set(column, [node]);
    }

    const positions = new Map<string, { x: number; y: number }>();
    let maxRows = 0;

    for (const [column, columnNodes] of columns) {
      maxRows = Math.max(maxRows, columnNodes.length);
      columnNodes.forEach((node, index) => {
        positions.set(node.id, { x: column * COLUMN_WIDTH + 10, y: index * ROW_HEIGHT + 24 });
      });
    }

    return {
      positions,
      width: (Math.max(...columns.keys(), 0) + 1) * COLUMN_WIDTH + 20,
      height: Math.max(maxRows * ROW_HEIGHT + 40, 80),
    };
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        There is no exposure graph to draw.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg
        aria-hidden="true"
        focusable="false"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="max-w-none"
      >
        {edges.map((edge) => {
          const from = layout.positions.get(edge.from);
          const to = layout.positions.get(edge.to);
          if (!from || !to) return null;

          const applied = edge.status === "applied";

          return (
            <line
              key={`${edge.from}-${edge.to}-${edge.kind}-${edge.status}`}
              x1={from.x + 180}
              y1={from.y - 4}
              x2={to.x}
              y2={to.y - 4}
              stroke={applied ? "var(--color-brand)" : "var(--color-fg-subtle)"}
              strokeWidth={applied ? 1.5 : 1}
              strokeDasharray={applied ? undefined : "4 3"}
            />
          );
        })}
        {nodes.map((node) => {
          const position = layout.positions.get(node.id);
          if (!position) return null;

          return (
            <g key={node.id}>
              <rect
                x={position.x}
                y={position.y - 18}
                width={180}
                height={28}
                rx={6}
                fill="none"
                stroke="var(--color-border-strong)"
              />
              <text x={position.x + 8} y={position.y} fill="var(--color-fg)" className="text-xs">
                {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
              </text>
              <text x={position.x + 8} y={position.y + 12} fill="var(--color-fg-subtle)" className="text-[10px]">
                {node.kind} · ${fromMicroUsd(node.totalMicroUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
