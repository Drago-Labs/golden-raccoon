"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { type DepthCurve } from "@/server/research/liquidity-depth/schema";

export type DepthChartProps = {
  curve: DepthCurve;
  baseSymbol: string;
  quoteSymbol: string;
};

type ChartDataPoint = {
  price: number;
  bidDepth?: number;
  askDepth?: number;
};

const emptySubscribe = () => () => {};

export function DepthChart({ curve, baseSymbol, quoteSymbol }: DepthChartProps) {
  const mounted = React.useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [showTable, setShowTable] = useState(false);

  const chartData: ChartDataPoint[] = [];

  for (const bid of [...curve.bids].reverse()) {
    chartData.push({
      price: Number(bid.price.toFixed(4)),
      bidDepth: Number(bid.cumulativeBase.toFixed(2)),
    });
  }

  for (const ask of curve.asks) {
    chartData.push({
      price: Number(ask.price.toFixed(4)),
      askDepth: Number(ask.cumulativeBase.toFixed(2)),
    });
  }

  return (
    <div
      className="rounded-lg border border-white/10 bg-white/5 p-4"
      role="region"
      aria-label="Cumulative Liquidity Depth Chart"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <h3 className="font-medium text-white">Cumulative Liquidity Depth</h3>
          <p className="text-xs text-white/50">
            Mid Price: {curve.midPrice > 0 ? `${curve.midPrice.toFixed(4)} ${quoteSymbol}` : "N/A"}{" "}
            {curve.spreadPercent !== undefined && `(Spread: ${curve.spreadPercent.toFixed(3)}%)`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          className="rounded border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
          aria-expanded={showTable}
        >
          {showTable ? "View Chart" : "View Data Table"}
        </button>
      </div>

      <div className="mt-4">
        {showTable ? (
          <div className="max-h-64 overflow-y-auto" tabIndex={0} aria-label="Accessible Depth Table">
            <table className="w-full text-left text-xs text-white/80">
              <thead className="sticky top-0 bg-[#121216] text-white/60">
                <tr>
                  <th className="py-1.5 px-2">Side</th>
                  <th className="py-1.5 px-2">Price ({quoteSymbol})</th>
                  <th className="py-1.5 px-2">Cumulative Depth ({baseSymbol})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {curve.bids.map((b, idx) => (
                  <tr key={`bid-${idx}`} className="hover:bg-white/5">
                    <td className="py-1.5 px-2 text-emerald-400 font-medium">BID</td>
                    <td className="py-1.5 px-2">{b.price.toFixed(4)}</td>
                    <td className="py-1.5 px-2">{b.cumulativeBase.toFixed(2)}</td>
                  </tr>
                ))}
                {curve.asks.map((a, idx) => (
                  <tr key={`ask-${idx}`} className="hover:bg-white/5">
                    <td className="py-1.5 px-2 text-rose-400 font-medium">ASK</td>
                    <td className="py-1.5 px-2">{a.price.toFixed(4)}</td>
                    <td className="py-1.5 px-2">{a.cumulativeBase.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : mounted && chartData.length > 0 ? (
          <div className="h-64 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="price"
                  stroke="#666"
                  fontSize={11}
                  tickFormatter={(val) => Number(val).toFixed(3)}
                />
                <YAxis
                  stroke="#666"
                  fontSize={11}
                  tickFormatter={(val) => Number(val).toLocaleString()}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181b", borderColor: "#3f3f46", borderRadius: "0.5rem" }}
                  itemStyle={{ fontSize: "0.75rem" }}
                  formatter={(value: unknown) => [Number(value).toLocaleString(), `Depth (${baseSymbol})`]}
                  labelFormatter={(label: unknown) => `Price: ${Number(label).toFixed(4)} ${quoteSymbol}`}
                />
                <Area
                  type="stepAfter"
                  dataKey="bidDepth"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.25}
                  name="Bid Depth"
                />
                <Area
                  type="stepAfter"
                  dataKey="askDepth"
                  stroke="#f43f5e"
                  fill="#f43f5e"
                  fillOpacity={0.25}
                  name="Ask Depth"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-white/40">
            No depth data available for this market
          </div>
        )}
      </div>
    </div>
  );
}
