"use client";

import { ConfusableWarning } from "./ConfusableWarning";
import { CoverageNotice } from "./CoverageNotice";
import { OwnershipPanel } from "./OwnershipPanel";
import { ResolutionInput } from "./ResolutionInput";
import { ResolutionSteps } from "./ResolutionSteps";
import { useWorkbenchState } from "./useWorkbenchState";

export function EnsVerifier() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      {!state.connected && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Connect an EVM wallet to verify ENS forward and reverse resolution.
        </div>
      )}
      <ResolutionInput
        connected={state.connected}
        ensName={state.ensName}
        onEnsNameChange={state.setEnsName}
        targetAddress={state.targetAddress}
        onTargetAddressChange={state.setTargetAddress}
        busy={state.busy}
        onSubmit={state.submit}
      />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {state.error}
        </div>
      )}
      {state.result && (
        <section aria-label="ENS resolution results" className="space-y-4">
          <ConfusableWarning confusables={state.result.confusables} />
          <ResolutionSteps
            classification={state.result.classification}
            forward={state.result.forward}
            reverse={state.result.reverse}
          />
          <OwnershipPanel ownership={state.result.ownership} />
          <CoverageNotice coverage={state.result.coverage} warnings={state.result.warnings} />
        </section>
      )}
    </div>
  );
}
