"use client";

import { useMemo } from "react";
import type { ObservationPoint } from "@/server/research/peg-observations/schema";

const WIDTH = 640;
const HEIGHT = 200;
const PADDING = 32;

/**
 * Deviation over time.
 *
 * Consecutive points are joined only when no gap separates them, so the chart
 * never draws a line across an interval nobody observed. Unconverted points are
 * drawn as hollow markers on the zero axis rather than omitted, and the chart is
 * `aria-hidden` because the accompanying table carries every value.
 */
export function DeviationChart({
  observations,
  thresholdBps,
  maxGapSeconds,
}: {
  observations: ObservationPoint[];
  thresholdBps: number;
  maxGapSeconds: number;
}) {
  const plot = useMemo(() => {
    const converted = observations.filter((point) => point.deviationBps !== null);
    if (converted.length === 0) return null;

    const times = observations.map((point) => Date.parse(point.observedAt));
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeRange = maxTime - minTime || 1;

    const magnitudes = converted.map((point) => Math.abs(point.deviationBps!));
    const bound = Math.max(...magnitudes, thresholdBps) * 1.2 || 1;

    const project = (point: ObservationPoint) => ({
      x: PADDING + ((Date.parse(point.observedAt) - minTime) / timeRange) * (WIDTH - PADDING * 2),
      y: HEIGHT / 2 - ((point.deviationBps ?? 0) / bound) * (HEIGHT / 2 - PADDING),
    });

    // Build one polyline per unbroken run, so a gap leaves a visible break.
    const segments: string[] = [];
    let run: string[] = [];

    for (let index = 0; index < observations.length; index += 1) {
      const point = observations[index];

      if (point.deviationBps === null) {
        if (run.length > 1) segments.push(run.join(" "));
        run = [];
        continue;
      }

      if (index > 0) {
        const previous = observations[index - 1];
        const gapSeconds = (Date.parse(point.observedAt) - Date.parse(previous.observedAt)) / 1_000;
        if (previous.deviationBps === null || gapSeconds > maxGapSeconds) {
          if (run.length > 1) segments.push(run.join(" "));
          run = [];
        }
      }

      const projected = project(point);
      run.push(`${projected.x.toFixed(2)},${projected.y.toFixed(2)}`);
    }

    if (run.length > 1) segments.push(run.join(" "));

    return {
      segments,
      markers: observations.map((point) => ({ ...project(point), converted: point.deviationBps !== null })),
      thresholdY: {
        above: HEIGHT / 2 - (thresholdBps / bound) * (HEIGHT / 2 - PADDING),
        below: HEIGHT / 2 + (thresholdBps / bound) * (HEIGHT / 2 - PADDING),
      },
      bound,
    };
  }, [observations, thresholdBps, maxGapSeconds]);

  if (!plot) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No observation in this window could be converted into the reference currency, so there is no deviation to plot.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full min-w-[32rem]">
        <line x1={PADDING} y1={HEIGHT / 2} x2={WIDTH - PADDING} y2={HEIGHT / 2} stroke="var(--color-border-strong)" />
        <line
          x1={PADDING}
          y1={plot.thresholdY.above}
          x2={WIDTH - PADDING}
          y2={plot.thresholdY.above}
          stroke="var(--color-fg-subtle)"
          strokeDasharray="4 4"
        />
        <line
          x1={PADDING}
          y1={plot.thresholdY.below}
          x2={WIDTH - PADDING}
          y2={plot.thresholdY.below}
          stroke="var(--color-fg-subtle)"
          strokeDasharray="4 4"
        />
        {plot.segments.map((segment) => (
          <polyline key={segment} points={segment} fill="none" stroke="var(--color-brand)" strokeWidth="2" />
        ))}
        {plot.markers.map((marker, index) => (
          <circle
            key={`${marker.x}-${marker.y}-${index}`}
            cx={marker.x}
            cy={marker.y}
            r="3"
            fill={marker.converted ? "var(--color-brand)" : "none"}
            stroke="var(--color-fg-subtle)"
          />
        ))}
        <text x={PADDING} y={plot.thresholdY.above - 4} fill="var(--color-fg-subtle)" className="text-[10px]">
          +{thresholdBps} bps
        </text>
        <text x={PADDING} y={plot.thresholdY.below + 12} fill="var(--color-fg-subtle)" className="text-[10px]">
          -{thresholdBps} bps
        </text>
      </svg>
    </div>
  );
}
