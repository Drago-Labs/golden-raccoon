"use client";

import { ContractInput } from "./ContractInput";
import { CoverageNotice } from "./CoverageNotice";
import { EventSampleTable } from "./EventSampleTable";
import { FindingSummary } from "./FindingSummary";
import { InterfaceTable } from "./InterfaceTable";
import { useWorkbenchState } from "./useWorkbenchState";

export function ConformanceReport() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      <header className="border-b border-white/10 pb-5">
        <div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">Security insight</div>
        <h1 className="mt-1 text-3xl font-semibold">SEP-41 token conformance</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Read-only check of a Soroban token&apos;s published spec, signature-free simulations for
          decimals/name/symbol/balance, and recent event topic/data shapes against the SEP-41 reference.
        </p>
      </header>

      <ContractInput
        networks={state.networks}
        network={state.network}
        onNetwork={(value) => state.setNetwork(value as typeof state.network)}
        contractId={state.contractId}
        onContractId={state.setContractId}
        balanceId={state.balanceId}
        onBalanceId={state.setBalanceId}
        busy={state.busy}
        onSubmit={state.submit}
      />

      <div aria-live="polite" className="sr-only">
        {state.busy
          ? "SEP-41 conformance check loading"
          : state.report
            ? `SEP-41 conformance check ${state.report.state}`
            : (state.error ?? "")}
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {state.error}
        </p>
      )}

      {state.report && (
        <section aria-label="SEP-41 conformance results" className="space-y-6 rounded-xl border border-white/10 p-5">
          <div>
            <h2 className="text-sm font-medium">Findings</h2>
            <div className="mt-2">
              <FindingSummary findings={state.report.findings} />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium">Interface</h2>
            <div className="mt-2">
              <InterfaceTable entries={state.report.interfaceDiff} />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium">Event samples</h2>
            <div className="mt-2">
              <EventSampleTable samples={state.report.eventSamples} shapes={state.report.eventShapes} />
            </div>
          </div>

          <CoverageNotice coverage={state.report.coverage} />
        </section>
      )}
    </div>
  );
}
