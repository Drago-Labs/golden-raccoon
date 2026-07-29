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
} from "recharts";

type AgentPoint = {
  date: string;
  score: number;
  confidence: number;
  runId: string;
};

type AgentScoreTrendCardProps = {
  agent: string;
  displayName: string;
  scoreKind: string;
  points: AgentPoint[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function scoreKindColor(kind: string) {
  switch (kind) {
    case "risk": return "#ef4444";
    case "trust": return "#22c55e";
    case "signal": return "#f59e0b";
    case "exposure": return "#8b5cf6";
    case "decision": return "#3b82f6";
    default: return "#6b7280";
  }
}

export function AgentScoreTrendCard({ agent, displayName, scoreKind, points }: AgentScoreTrendCardProps) {
  const chartData = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        label: formatDate(p.date),
      })),
    [points],
  );

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/50">{displayName}</div>
        <div className="mt-3 text-xs text-white/38">No data points yet.</div>
      </div>
    );
  }

  const latest = points[points.length - 1];
  const color = scoreKindColor(scoreKind);

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/50">{displayName}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/38 capitalize">{scoreKind}</span>
          <span className="text-sm font-semibold" style={{ color }}>{latest.score}/100</span>
        </div>
      </div>
      {points.length >= 2 ? (
        <div className="mt-3">
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }}
                width={20}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke={color}
                strokeWidth={2}
                dot={{ r: 2, fill: color }}
                name={displayName}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-white/42">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          Score: {latest.score}/100 &middot; Confidence: {Math.round(latest.confidence * 100)}%
        </div>
      )}
    </div>
  );
}
