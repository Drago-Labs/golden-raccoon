import React from "react";
import { Check, XCircle, AlertCircle } from "lucide-react";
import { type SizeLadderStep } from "@/server/research/liquidity-depth/schema";

export type SizeLadderProps = {
  ladder: SizeLadderStep[];
  baseSymbol: string;
  quoteSymbol: string;
  tradeSide: "buy" | "sell";
};

export function SizeLadder({ ladder, baseSymbol, quoteSymbol, tradeSide }: SizeLadderProps) {
  const getImpactBadge = (percent: number, insufficientDepth: boolean) => {
    if (insufficientDepth) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
          N/A
        </span>
      );
    }
    if (percent <= 1.0) {
      return (
        <span className="inline-flex items-center rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
          +{percent.toFixed(2)}%
        </span>
      );
    }
    if (percent <= 3.0) {
      return (
        <span className="inline-flex items-center rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
          +{percent.toFixed(2)}%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-400">
        +{percent.toFixed(2)}%
      </span>
    );
  };

  return (
    <div
      className="rounded-lg border border-white/10 bg-white/5 p-4"
      role="region"
      aria-label="Trade Size Capacity Ladder"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div>
          <h3 className="font-medium text-white">Execution Size Ladder</h3>
          <p className="text-xs text-white/50">
            Side: {tradeSide === "buy" ? `Buy ${baseSymbol} with ${quoteSymbol}` : `Sell ${baseSymbol} for ${quoteSymbol}`}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto" tabIndex={0} aria-label="Size Ladder Table">
        <table className="w-full min-w-[550px] text-left text-xs text-white/80">
          <thead className="border-b border-white/10 bg-white/5 text-white/60">
            <tr>
              <th scope="col" className="py-2 px-3">Size ({baseSymbol})</th>
              <th scope="col" className="py-2 px-3">Avg Exec Price</th>
              <th scope="col" className="py-2 px-3">Marginal Price</th>
              <th scope="col" className="py-2 px-3">Price Impact</th>
              <th scope="col" className="py-2 px-3">Fee ({quoteSymbol})</th>
              <th scope="col" className="py-2 px-3">Net Output</th>
              <th scope="col" className="py-2 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {ladder.map((step, idx) => (
              <tr
                key={idx}
                className={`hover:bg-white/5 ${step.insufficientDepth ? "opacity-60" : ""}`}
              >
                <td className="py-2 px-3 font-medium text-white">
                  {Number(step.size).toLocaleString()}
                </td>
                <td className="py-2 px-3">
                  {step.insufficientDepth ? "—" : `${step.averageExecutionPrice} ${quoteSymbol}`}
                </td>
                <td className="py-2 px-3">
                  {step.insufficientDepth ? "—" : `${step.marginalPrice} ${quoteSymbol}`}
                </td>
                <td className="py-2 px-3">
                  {getImpactBadge(step.priceImpactPercent, step.insufficientDepth)}
                </td>
                <td className="py-2 px-3">
                  {step.insufficientDepth ? "—" : `${step.feeAmount}`}
                </td>
                <td className="py-2 px-3">
                  {step.insufficientDepth
                    ? "—"
                    : `${step.netOutputAmount} ${tradeSide === "buy" ? quoteSymbol : quoteSymbol}`}
                </td>
                <td className="py-2 px-3 text-center">
                  {step.executable ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400" title="Executable">
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : step.insufficientDepth ? (
                    <span className="inline-flex items-center gap-1 text-rose-400" title={step.warning || "Insufficient Depth"}>
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400" title={step.warning || "Warning"}>
                      <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
