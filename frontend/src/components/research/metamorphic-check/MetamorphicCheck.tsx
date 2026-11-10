"use client";

import { AddressInput } from "./AddressInput";
import { BytecodeFindings } from "./BytecodeFindings";
import { CodeHashHistory } from "./CodeHashHistory";
import { CoverageNotice } from "./CoverageNotice";
import { DeploymentEvidence } from "./DeploymentEvidence";
import { useWorkbenchState } from "./useWorkbenchState";

export function MetamorphicCheck() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      {!state.connected && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Connect an EVM wallet to inspect contracts for metamorphic deployment patterns.
        </div>
      )}
      <AddressInput
        connected={state.connected}
        network={state.network}
        onNetworkChange={state.setNetwork}
        contractAddress={state.contractAddress}
        onAddressChange={state.setContractAddress}
        busy={state.busy}
        onSubmit={state.submit}
      />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {state.error}
        </div>
      )}
      {state.result && (
        <section aria-label="Metamorphic check results" className="space-y-4">
          <DeploymentEvidence classification={state.result.classification} creation={state.result.creation} />
          <BytecodeFindings
            opcodes={state.result.opcodes}
            initCodePatterns={state.result.initCodePatterns}
            forkRules={state.result.forkRules}
          />
          <CodeHashHistory history={state.result.codeHashHistory} />
          <CoverageNotice coverage={state.result.coverage} warnings={state.result.warnings} />
        </section>
      )}
    </div>
  );
}
