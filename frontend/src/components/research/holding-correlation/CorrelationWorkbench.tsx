"use client";

import { ClusterPanel } from "./ClusterPanel";
import { CorrelationMatrix } from "./CorrelationMatrix";
import { CoverageNotice } from "./CoverageNotice";
import { ExclusionList } from "./ExclusionList";
import { useWorkbenchState } from "./useWorkbenchState";
import { WalletWindowInput } from "./WalletWindowInput";

export function CorrelationWorkbench() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      {!state.connected && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Connect an EVM wallet to measure return correlation across holdings.
        </div>
      )}
      <WalletWindowInput
        connected={state.connected}
        network={state.network}
        onNetworkChange={state.setNetwork}
        windowDays={state.windowDays}
        onWindowDaysChange={state.setWindowDays}
        clusterThreshold={state.clusterThreshold}
        onClusterThresholdChange={state.setClusterThreshold}
        busy={state.busy}
        onSubmit={state.submit}
      />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {state.error}
        </div>
      )}
      {state.result && (
        <section aria-label="Holding correlation results" className="space-y-4">
          <CorrelationMatrix pairs={state.result.pairs} />
          <ClusterPanel clusters={state.result.clusters} />
          <ExclusionList exclusions={state.result.exclusions} />
          <CoverageNotice coverage={state.result.coverage} warnings={state.result.warnings} />
        </section>
      )}
    </div>
  );
}
