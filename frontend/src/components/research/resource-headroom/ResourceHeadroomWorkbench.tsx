"use client";

import { CoverageNotice } from "./CoverageNotice";
import { HeadroomWarnings } from "./HeadroomWarnings";
import { InvocationForm } from "./InvocationForm";
import { LimitTable } from "./LimitTable";
import { ResourceGaugeList } from "./ResourceGaugeList";
import { useWorkbenchState } from "./useWorkbenchState";

export function ResourceHeadroomWorkbench() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      <p className="text-xs text-white/60">
        Read-only resource comparison. Never signs or submits transactions.
      </p>
      <InvocationForm
        network={state.network}
        onNetworkChange={state.setNetwork}
        mode={state.mode}
        onModeChange={state.setMode}
        contractId={state.contractId}
        onContractIdChange={state.setContractId}
        functionName={state.functionName}
        onFunctionNameChange={state.setFunctionName}
        txHash={state.txHash}
        onTxHashChange={state.setTxHash}
        warningThresholdPct={state.warningThresholdPct}
        onWarningThresholdChange={state.setWarningThresholdPct}
        busy={state.busy}
        onSubmit={state.submit}
      />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {state.error}
        </div>
      )}
      {state.report && (
        <section aria-label="Resource headroom results" className="space-y-4">
          <HeadroomWarnings
            simulationFailed={state.report.simulationFailed}
            failureMessage={state.report.failureMessage}
            diagnosticEvents={state.report.diagnosticEvents}
            flaggedResources={state.report.flaggedResources}
          />
          <ResourceGaugeList resources={state.report.resources} />
          <LimitTable
            resources={state.report.resources}
            limitsLedger={state.report.limitsLedger}
          />
          <CoverageNotice coverage={state.report.coverage} warnings={state.report.warnings} />
        </section>
      )}
    </div>
  );
}
