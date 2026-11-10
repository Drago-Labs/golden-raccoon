"use client";

import { CoverageNotice } from "./CoverageNotice";
import { DrawdownChart } from "./DrawdownChart";
import { GapReport } from "./GapReport";
import { MetricSummary } from "./MetricSummary";
import { SeriesInput } from "./SeriesInput";
import { useWorkbenchState } from "./useWorkbenchState";

export function VolatilityProfile() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      {!state.connected && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Connect a wallet to profile historical volatility and drawdowns.
        </div>
      )}
      <SeriesInput
        connected={state.connected}
        assetSymbol={state.assetSymbol}
        onAssetChange={state.setAssetSymbol}
        interval={state.interval}
        onIntervalChange={state.setInterval}
        windowDays={state.windowDays}
        onWindowDaysChange={state.setWindowDays}
        busy={state.busy}
        onSubmit={state.submit}
      />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {state.error}
        </div>
      )}
      {state.result && (
        <section aria-label="Volatility profile results" className="space-y-4">
          <MetricSummary volatility={state.result.volatility} drawdown={state.result.drawdown} />
          <DrawdownChart drawdown={state.result.drawdown} />
          <GapReport gaps={state.result.gaps} />
          <CoverageNotice coverage={state.result.coverage} warnings={state.result.warnings} />
        </section>
      )}
    </div>
  );
}
