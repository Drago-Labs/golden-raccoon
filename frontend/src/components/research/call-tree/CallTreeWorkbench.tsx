"use client";

import { CallNodeDetail } from "./CallNodeDetail";
import { CallTree } from "./CallTree";
import { CoverageNotice } from "./CoverageNotice";
import { TraceInput } from "./TraceInput";
import { TransferSummary } from "./TransferSummary";
import { useWorkbenchState } from "./useWorkbenchState";

export function CallTreeWorkbench() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      <p className="text-xs text-white/60">
        Read-only invocation trace. Never submits or signs transactions.
      </p>
      <TraceInput
        network={state.network}
        onNetworkChange={state.setNetwork}
        txHash={state.txHash}
        onTxHashChange={state.setTxHash}
        busy={state.busy}
        onSubmit={state.submit}
      />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {state.error}
        </div>
      )}
      {state.report && (
        <section aria-label="Call tree trace results" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <CallTree
              roots={state.report.roots}
              selectedNodeId={state.selectedNodeId}
              onSelectNode={state.setSelectedNodeId}
            />
            <CallNodeDetail node={state.selectedNode} failure={state.report.failure} />
          </div>
          <TransferSummary netMovements={state.report.netMovements} />
          <CoverageNotice coverage={state.report.coverage} warnings={state.report.warnings} />
        </section>
      )}
    </div>
  );
}
