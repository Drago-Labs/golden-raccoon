"use client";

import React, { useState } from "react";
import {
  type GapInterval,
  type NormalizedObservation,
  type ObservationWindow,
  type PegDefinition,
} from "@/server/research/peg-observations";
import { VisuallyHidden } from "@/components/a11y/VisuallyHidden";

interface DeviationChartProps {
  observations: NormalizedObservation[];
  pegDefinition: PegDefinition;
  window?: ObservationWindow;
  gaps?: GapInterval[];
  thresholdBps: number;
  className?: string;
}

/**
 * Accessible SVG chart displaying peg deviation in basis points over time,
 * with threshold bands, coverage gaps, and screen reader equivalent tabular data.
 */
export function DeviationChart({
  observations,
  pegDefinition,
  window,
  gaps = [],
  thresholdBps,
  className = "",
}: DeviationChartProps) {
  const [showDataTable, setShowDataTable] = useState(false);

  const validPoints = observations.filter(
    (obs): obs is NormalizedObservation & { deviationBps: number } => obs.deviationBps !== null,
  );

  if (validPoints.length === 0) {
    return (
      <div
        className={`flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center ${className}`}
      >
        <p className="text-sm font-medium text-zinc-300">No Valid Deviation Points</p>
        <p className="mt-1 text-xs text-zinc-500">
          No price observations with matching reference conversion rates exist for the selected window.
        </p>
      </div>
    );
  }

  const minTime = window?.startTime ?? validPoints[0].timestamp;
  const maxTime = Math.max(
    window?.endTime ?? validPoints[validPoints.length - 1].timestamp,
    minTime + 1,
  );
  const timeSpan = maxTime - minTime;

  const deviations = validPoints.map((p) => p.deviationBps);
  const dataMinDev = Math.min(...deviations);
  const dataMaxDev = Math.max(...deviations);
  const maxAbsDev = Math.max(thresholdBps * 1.5, Math.abs(dataMinDev), Math.abs(dataMaxDev), 50);

  const chartWidth = 800;
  const chartHeight = 320;
  const padding = { top: 30, right: 30, bottom: 40, left: 60 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  function scaleX(timestamp: number): number {
    return padding.left + ((timestamp - minTime) / timeSpan) * innerWidth;
  }

  function scaleY(bps: number): number {
    const clamped = Math.max(-maxAbsDev, Math.min(maxAbsDev, bps));
    return padding.top + innerHeight / 2 - (clamped / maxAbsDev) * (innerHeight / 2);
  }

  const zeroY = scaleY(0);
  const upperThresholdY = scaleY(thresholdBps);
  const lowerThresholdY = scaleY(-thresholdBps);

  const linePathPoints = validPoints
    .map((obs, index) => {
      const x = scaleX(obs.timestamp).toFixed(2);
      const y = scaleY(obs.deviationBps).toFixed(2);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 backdrop-blur-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-zinc-200 uppercase">
            Peg Deviation Trajectory (Basis Points)
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Target: {pegDefinition.declaredTargetValue} {pegDefinition.referenceCurrency} | Threshold:{" "}
            {thresholdBps} bps
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDataTable((prev) => !prev)}
            className="rounded border border-zinc-700 bg-zinc-800/90 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:bg-zinc-700 focus:ring-2 focus:ring-zinc-400 focus:outline-none"
            aria-expanded={showDataTable}
          >
            {showDataTable ? "Hide Data Table" : "Show Data Table"}
          </button>
        </div>
      </div>

      <div className="relative mt-4 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-auto w-full min-w-[600px]"
          role="img"
          aria-label={`Time series chart of peg deviations for ${pegDefinition.name} over observation window`}
        >
          <title>{`Peg Deviation Chart: ${pegDefinition.name}`}</title>
          <desc>
            {`Visual chart showing ${validPoints.length} observations between ${new Date(
              minTime,
            ).toISOString()} and ${new Date(
              maxTime,
            ).toISOString()} with deviations ranging from ${dataMinDev} to ${dataMaxDev} basis points.`}
          </desc>

          {gaps.map((gap, index) => {
            const gapX = scaleX(gap.startTime);
            const gapWidth = Math.max(2, scaleX(gap.endTime) - gapX);
            return (
              <rect
                key={`gap-${index}`}
                x={gapX}
                y={padding.top}
                width={gapWidth}
                height={innerHeight}
                className="fill-amber-500/10 stroke-amber-500/30 stroke-dasharray-2"
              />
            );
          })}

          <line
            x1={padding.left}
            y1={zeroY}
            x2={chartWidth - padding.right}
            y2={zeroY}
            className="stroke-zinc-600 stroke-[1.5]"
          />

          <line
            x1={padding.left}
            y1={upperThresholdY}
            x2={chartWidth - padding.right}
            y2={upperThresholdY}
            className="stroke-amber-500/60 stroke-[1] stroke-dasharray-4"
          />
          <text
            x={chartWidth - padding.right - 5}
            y={upperThresholdY - 6}
            textAnchor="end"
            className="fill-amber-400 text-[10px] font-mono"
          >
            +{thresholdBps} bps
          </text>

          <line
            x1={padding.left}
            y1={lowerThresholdY}
            x2={chartWidth - padding.right}
            y2={lowerThresholdY}
            className="stroke-amber-500/60 stroke-[1] stroke-dasharray-4"
          />
          <text
            x={chartWidth - padding.right - 5}
            y={lowerThresholdY + 14}
            textAnchor="end"
            className="fill-amber-400 text-[10px] font-mono"
          >
            -{thresholdBps} bps
          </text>

          <path
            d={linePathPoints}
            fill="none"
            className="stroke-sky-400 stroke-2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {validPoints.map((obs, idx) => {
            const cx = scaleX(obs.timestamp);
            const cy = scaleY(obs.deviationBps);
            const isBreach = Math.abs(obs.deviationBps) >= thresholdBps;
            return (
              <circle
                key={`pt-${idx}`}
                cx={cx}
                cy={cy}
                r={isBreach ? 4 : 2.5}
                className={isBreach ? "fill-rose-400 stroke-rose-950 stroke-1" : "fill-sky-300"}
              />
            );
          })}
        </svg>
      </div>

      <VisuallyHidden>
        <h4>Screen Reader Tabular Equivalent</h4>
        <table>
          <caption>Observation points and calculated basis point deviations</caption>
          <thead>
            <tr>
              <th scope="col">Timestamp (UTC)</th>
              <th scope="col">Normalized Price</th>
              <th scope="col">Currency</th>
              <th scope="col">Deviation (bps)</th>
            </tr>
          </thead>
          <tbody>
            {validPoints.map((obs, i) => (
              <tr key={`sr-${i}`}>
                <td>{new Date(obs.timestamp).toISOString()}</td>
                <td>{obs.normalizedPrice}</td>
                <td>{obs.referenceCurrency}</td>
                <td>{obs.deviationBps} bps</td>
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>

      {showDataTable && (
        <div className="mt-4 max-h-60 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <table className="w-full text-left text-xs text-zinc-300">
            <caption className="sr-only">Detailed observation points</caption>
            <thead className="border-b border-zinc-800 text-[11px] text-zinc-400 uppercase">
              <tr>
                <th scope="col" className="py-2">
                  Timestamp
                </th>
                <th scope="col" className="py-2">
                  Price
                </th>
                <th scope="col" className="py-2">
                  Reference
                </th>
                <th scope="col" className="py-2">
                  Deviation (bps)
                </th>
                <th scope="col" className="py-2">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {validPoints.map((obs, i) => {
                const isBreach = Math.abs(obs.deviationBps) >= thresholdBps;
                return (
                  <tr key={`dt-${i}`} className={isBreach ? "bg-rose-950/20" : ""}>
                    <td className="py-1.5">{new Date(obs.timestamp).toLocaleTimeString()}</td>
                    <td className="py-1.5">{obs.normalizedPrice}</td>
                    <td className="py-1.5">{obs.referenceCurrency}</td>
                    <td
                      className={`py-1.5 font-bold ${
                        isBreach
                          ? "text-rose-400"
                          : obs.deviationBps > 0
                            ? "text-emerald-400"
                            : "text-zinc-300"
                      }`}
                    >
                      {obs.deviationBps > 0 ? `+${obs.deviationBps}` : obs.deviationBps} bps
                    </td>
                    <td className="py-1.5 text-[11px]">
                      {isBreach ? "Threshold Breach" : "Within Peg"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
