import type { ReturnBreakdown } from "@/server/research/pool-share-returns/schema";

type ReturnBreakdownChartProps = {
  breakdown: ReturnBreakdown;
};

export function ReturnBreakdownChart({ breakdown }: ReturnBreakdownChartProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
      <h3 className="mb-4 text-lg font-semibold">Return Breakdown</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Hold Value</span>
          <span className="font-mono text-sm">{breakdown.holdValue}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Pool Value</span>
          <span className="font-mono text-sm">{breakdown.poolValue}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Fee Income</span>
          <span className="font-mono text-sm text-green-400">+{breakdown.feeIncome}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Divergence Loss</span>
          <span className="font-mono text-sm text-red-400">{breakdown.divergenceLoss}</span>
        </div>
        <div className="flex items-center justify-between border-t border-white/10 pt-3">
          <span className="text-sm font-semibold">Total Return</span>
          <span className="font-mono text-sm font-semibold">{breakdown.totalReturn}</span>
        </div>
      </div>
    </div>
  );
}
