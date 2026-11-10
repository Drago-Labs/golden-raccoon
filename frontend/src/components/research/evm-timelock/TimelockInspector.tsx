"use client";

import { CoverageNotice } from "./CoverageNotice";
import { DecodedCallPanel } from "./DecodedCallPanel";
import { OperationQueue } from "./OperationQueue";
import { RolePanel } from "./RolePanel";
import { TimelockInput } from "./TimelockInput";
import { useWorkbenchState } from "./useWorkbenchState";

export function TimelockInspector() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      {!state.connected && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Connect an EVM wallet to inspect TimelockController operations.
        </div>
      )}
      <TimelockInput
        connected={state.connected}
        network={state.network}
        onNetworkChange={state.setNetwork}
        timelockAddress={state.timelockAddress}
        onAddressChange={state.setTimelockAddress}
        busy={state.busy}
        onSubmit={state.submit}
      />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {state.error}
        </div>
      )}
      {state.result && (
        <section aria-label="Timelock inspection results" className="space-y-4">
          <OperationQueue operations={state.result.operations} />
          <DecodedCallPanel operations={state.result.operations} />
          <RolePanel roles={state.result.roles} />
          <CoverageNotice coverage={state.result.coverage} warnings={state.result.warnings} />
        </section>
      )}
    </div>
  );
}
