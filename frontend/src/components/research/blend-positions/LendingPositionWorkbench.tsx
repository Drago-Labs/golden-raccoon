"use client";

import { CoverageNotice } from "./CoverageNotice";
import { HealthBreakdown } from "./HealthBreakdown";
import { PositionInput } from "./PositionInput";
import { PositionTable } from "./PositionTable";
import { ScenarioPanel } from "./ScenarioPanel";
import { useWorkbenchState } from "./useWorkbenchState";

export function LendingPositionWorkbench() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      <p data-testid="blend-readonly-notice" className="text-xs text-white/60">
        Read-only analysis. This view never supplies, borrows, repays, or signs transactions.
      </p>
      <PositionInput
        network={state.network}
        onNetworkChange={state.setNetwork}
        poolId={state.poolId}
        onPoolIdChange={state.setPoolId}
        accountId={state.accountId}
        onAccountIdChange={state.setAccountId}
        busy={state.busy}
        onSubmit={state.submit}
      />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {state.error}
        </div>
      )}
      {state.report && (
        <section aria-label="Blend position results" className="space-y-4">
          <HealthBreakdown health={state.report.health} />
          <PositionTable positions={state.report.positions} />
          <ScenarioPanel scenarios={state.report.scenarios} />
          <CoverageNotice coverage={state.report.coverage} warnings={state.report.warnings} />
        </section>
      )}
    </div>
  );
}
