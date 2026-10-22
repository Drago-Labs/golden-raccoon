"use client";

import { AccountingSummary } from "./AccountingSummary";
import { CoverageNotice } from "./CoverageNotice";
import { RoundingTable } from "./RoundingTable";
import { SharePriceChart } from "./SharePriceChart";
import { VaultInput } from "./VaultInput";
import { useWorkbenchState } from "./useWorkbenchState";

export function VaultAccountingWorkbench() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      <header className="border-b border-white/10 pb-5">
        <div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">Security insight</div>
        <h1 className="mt-1 text-3xl font-semibold">ERC-4626 vault accounting</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Reads a vault&apos;s share price, compares what it reports to what it actually holds, and checks deposit
          rounding with exact integer arithmetic — so inflated <code>totalAssets</code>, donation-based price
          manipulation, and silent rounding loss are visible before you deposit, not after.
        </p>
      </header>

      {!state.connected && (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Connect an EVM wallet to run a read-only vault scan.
        </p>
      )}

      <VaultInput
        connected={state.connected}
        network={state.network}
        onNetwork={state.setNetwork}
        vaultAddress={state.vaultAddress}
        onVaultAddress={state.setVaultAddress}
        blockNumber={state.blockNumber}
        onBlockNumber={state.setBlockNumber}
        sampleAmounts={state.sampleAmounts}
        sampleDraft={state.sampleDraft}
        onSampleDraft={state.setSampleDraft}
        onAddSample={state.addSample}
        onRemoveSample={state.removeSample}
        busy={state.busy}
        onSubmit={state.submit}
      />

      <div aria-live="polite" className="sr-only">
        {state.busy ? "Vault accounting read loading" : state.result ? `Vault accounting read ${state.result.state}` : (state.error ?? "")}
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {state.error}
        </p>
      )}

      {state.result && (
        <section aria-label="Vault accounting results" className="space-y-6 rounded-xl border border-white/10 p-5">
          <AccountingSummary result={state.result} />

          <div>
            <h2 className="text-sm font-medium">Deposit rounding</h2>
            <div className="mt-2">
              <RoundingTable samples={state.result.roundingSamples} />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium">Share price over the sampled window</h2>
            <div className="mt-2">
              <SharePriceChart points={state.result.priceSamples} jumps={state.result.priceJumps} />
            </div>
          </div>

          <CoverageNotice coverage={state.result.coverage} warnings={state.result.warnings} />
        </section>
      )}
    </div>
  );
}
