"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type TrendPoint = {
  date: string;
  buyRisk: number;
  confidence: number;
};

type TrendChartProps = {
  data: TrendPoint[];
  loading?: boolean;
  error?: string | null;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TrendChart({ data, loading, error }: TrendChartProps) {
  const chartData = useMemo(
    () =>
      data.map((p) => ({
        ...p,
        label: formatDate(p.date),
      })),
    [data],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-white/5 text-sm text-white/42">
        Loading trend data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-red-300/20 bg-red-500/5 text-sm text-red-200/70">
        {error}
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-white/5 text-sm text-white/42">
        No trend data yet. Run token scans to populate.
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white/5 p-4">
      <h3 className="mb-4 text-sm font-semibold text-white/80">Buy Risk &amp; Confidence Over Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "rgba(255,255,255,0.6)" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}
          />
          <Line
            type="monotone"
            dataKey="buyRisk"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3, fill: "#ef4444" }}
            name="Buy Risk"
          />
          <Line
            type="monotone"
            dataKey="confidence"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 3, fill: "#22c55e" }}
            name="Confidence"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
