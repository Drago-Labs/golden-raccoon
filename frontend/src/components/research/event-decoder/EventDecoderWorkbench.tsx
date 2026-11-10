"use client";

import { ContractInput } from "./ContractInput";
import { CoverageNotice } from "./CoverageNotice";
import { DecodedEventList } from "./DecodedEventList";
import { EventFilter } from "./EventFilter";
import { useWorkbenchState } from "./useWorkbenchState";

export function EventDecoderWorkbench() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      <p className="text-xs text-white/60">
        Read-only Soroban event explorer. Decodes ScVal topics and data against the contract&apos;s own Wasm spec.
      </p>
      <ContractInput
        network={state.network}
        onNetworkChange={state.setNetwork}
        contractId={state.contractId}
        onContractIdChange={state.setContractId}
        startLedger={state.startLedger}
        onStartLedgerChange={state.setStartLedger}
        endLedger={state.endLedger}
        onEndLedgerChange={state.setEndLedger}
        busy={state.busy}
        onSubmit={state.submit}
      />
      <EventFilter
        topicFilter={state.topicFilter}
        onTopicFilterChange={state.setTopicFilter}
        showRaw={state.showRaw}
        onToggleRaw={() => state.setShowRaw((prev) => !prev)}
      />
      {state.error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          {state.error}
        </div>
      )}
      {state.report && (
        <section aria-label="Decoded contract events results" className="space-y-4">
          <DecodedEventList events={state.report.events} showRaw={state.showRaw} />
          <CoverageNotice coverage={state.report.coverage} warnings={state.report.warnings} />
        </section>
      )}
    </div>
  );
}
