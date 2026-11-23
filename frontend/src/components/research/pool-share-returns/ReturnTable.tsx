import type { ReturnBreakdown } from "@/server/research/pool-share-returns/schema";

type ReturnTableProps = {
  breakdown: ReturnBreakdown;
};

export function ReturnTable({ breakdown }: ReturnTableProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
      <h3 className="mb-4 text-lg font-semibold">Return Table</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="pb-2 text-left font-medium text-muted">Component</th>
              <th className="pb-2 text-right font-medium text-muted">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            <tr>
              <td className="py-2">Hold Value</td>
              <td className="py-2 text-right font-mono">{breakdown.holdValue}</td>
            </tr>
            <tr>
              <td className="py-2">Pool Value</td>
              <td className="py-2 text-right font-mono">{breakdown.poolValue}</td>
            </tr>
            <tr>
              <td className="py-2">Fee Income</td>
              <td className="py-2 text-right font-mono text-green-400">+{breakdown.feeIncome}</td>
            </tr>
            <tr>
              <td className="py-2">Divergence Loss</td>
              <td className="py-2 text-right font-mono text-red-400">{breakdown.divergenceLoss}</td>
            </tr>
            <tr className="font-semibold">
              <td className="py-2">Total Return</td>
              <td className="py-2 text-right font-mono">{breakdown.totalReturn}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
