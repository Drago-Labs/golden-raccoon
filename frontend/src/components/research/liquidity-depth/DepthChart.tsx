"use client";

import { useMemo } from "react";
import type { AssetIdentity, DepthLevel } from "@/server/research/liquidity-depth/schema";

const WIDTH = 560;
const HEIGHT = 180;
const PADDING = 28;

/**
 * Cumulative depth curve.
 *
 * Decorative: the chart is `aria-hidden` and every point it plots is also a row
 * in the accompanying table, so nothing is reachable only by looking at it.
 */
export function DepthChart({ levels, base }: { levels: DepthLevel[]; base: AssetIdentity }) {
  const path = useMemo(() => {
    if (levels.length === 0) return null;

    const depths = levels.map((level) => Number(level.cumulativeBaseAmount));
    const prices = levels.map((level) => Number(level.price));
    const maxDepth = Math.max(...depths, 1);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const points = levels.map((level, index) => {
      const x = PADDING + (depths[index] / maxDepth) * (WIDTH - PADDING * 2);
      const y = HEIGHT - PADDING - ((prices[index] - minPrice) / priceRange) * (HEIGHT - PADDING * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    return { points: points.join(" "), maxDepth, minPrice, maxPrice };
  }, [levels]);

  if (!path) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        There is no depth curve to plot for this venue.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[30rem]">
        <line x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} stroke="var(--color-border-strong)" />
        <line x1={PADDING} y1={PADDING} x2={PADDING} y2={HEIGHT - PADDING} stroke="var(--color-border-strong)" />
        <polyline points={path.points} fill="none" stroke="var(--color-brand)" strokeWidth="2" />
        {path.points.split(" ").map((point) => {
          const [x, y] = point.split(",");
          return <circle key={point} cx={x} cy={y} r="3" fill="var(--color-brand)" />;
        })}
        <text x={PADDING} y={HEIGHT - 8} fill="var(--color-fg-subtle)" className="text-[10px]">
          0
        </text>
        <text x={WIDTH - PADDING} y={HEIGHT - 8} textAnchor="end" fill="var(--color-fg-subtle)" className="text-[10px]">
          {`${(path.maxDepth / 10 ** base.decimals).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${base.symbol}`}
        </text>
        <text x={PADDING + 4} y={PADDING} fill="var(--color-fg-subtle)" className="text-[10px]">
          {path.maxPrice}
        </text>
        <text x={PADDING + 4} y={HEIGHT - PADDING - 4} fill="var(--color-fg-subtle)" className="text-[10px]">
          {path.minPrice}
        </text>
      </svg>
    </div>
  );
}
