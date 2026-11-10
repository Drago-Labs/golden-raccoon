"use client";

import { BindingInput } from "./BindingInput";
import { CoverageNotice } from "./CoverageNotice";
import { DerivationSteps } from "./DerivationSteps";
import { InstanceEvidence } from "./InstanceEvidence";
import { MetadataComparison } from "./MetadataComparison";
import { useWorkbenchState } from "./useWorkbenchState";

export function SacVerifier() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      <p className="text-xs text-white/60">
        Read-only SAC verifier. Never deploys contracts, wraps assets, or signs transactions.
      </p>
      <BindingInput
        network={state.network}
        onNetworkChange={state.setNetwork}
        asset={state.asset}
        onAssetChange={state.setAsset}
        contractId={state.contractId}
        onContractIdChange={state.setContractId}
        busy={state.busy}
        onSubmit={state.submit}
      />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {state.error}
        </div>
      )}
      {state.report && (
        <section aria-label="SAC verification results" className="space-y-4">
          <InstanceEvidence
            classification={state.report.classification}
            instance={state.report.instance}
          />
          <DerivationSteps derivation={state.report.derivation} />
          <MetadataComparison comparison={state.report.metadataComparison} />
          <CoverageNotice coverage={state.report.coverage} warnings={state.report.warnings} />
        </section>
      )}
    </div>
  );
}
