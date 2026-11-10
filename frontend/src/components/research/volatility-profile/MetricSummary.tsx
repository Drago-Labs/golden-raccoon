import type { DrawdownSummary, VolatilityMetrics } from "@/server/research/volatility-profile";

export function MetricSummary(props: { volatility: VolatilityMetrics; drawdown: DrawdownSummary }) {
  return (
    <div className="grid gap-3 rounded-lg border border-white/10 p-4 text-xs sm:grid-cols-3">
      <div>
        <div className="text-white/50">Annualised volatility</div>
        <div className="text-sm font-semibold text-white">
          {props.volatility.annualisedVolatility !== null
            ? `${(props.volatility.annualisedVolatility * 100).toFixed(2)}%`
            : "Unavailable"}
        </div>
      </div>
      <div>
        <div className="text-white/50">Max drawdown</div>
        <div className="text-sm font-semibold text-white">{props.drawdown.maxDrawdownPct.toFixed(2)}%</div>
      </div>
      <div>
        <div className="text-white/50">Sample size</div>
        <div className="text-sm font-semibold text-white">{props.volatility.sampleSize} steps</div>
      </div>
    </div>
  );
}
