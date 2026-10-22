"use client";

import { CollectionInput } from "./CollectionInput";
import { CoverageNotice } from "./CoverageNotice";
import { HostingSummary } from "./HostingSummary";
import { MutabilityPanel } from "./MutabilityPanel";
import { SampleTable } from "./SampleTable";
import { useWorkbenchState } from "./useWorkbenchState";

export function NftMetadataInspector() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      <header className="border-b border-white/10 pb-5">
        <div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">Security insight</div>
        <h1 className="mt-1 text-3xl font-semibold">NFT metadata hosting &amp; mutability</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Reads where a collection&apos;s metadata and media are hosted, whether sampled tokens actually resolve, and
          whether the contract exposes a way to change that metadata after the fact — so a collection backed by a
          single mutable web server isn&apos;t mistaken for one permanently pinned to content-addressed storage.
        </p>
      </header>

      {!state.connected && (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Connect an EVM wallet to run a read-only metadata scan.
        </p>
      )}

      <CollectionInput
        connected={state.connected}
        network={state.network}
        onNetwork={state.setNetwork}
        contractAddress={state.contractAddress}
        onContractAddress={state.setContractAddress}
        blockNumber={state.blockNumber}
        onBlockNumber={state.setBlockNumber}
        tokenIds={state.tokenIds}
        tokenIdDraft={state.tokenIdDraft}
        onTokenIdDraft={state.setTokenIdDraft}
        onAddTokenId={state.addTokenId}
        onRemoveTokenId={state.removeTokenId}
        busy={state.busy}
        onSubmit={state.submit}
      />

      <div aria-live="polite" className="sr-only">
        {state.busy ? "NFT metadata inspection loading" : state.result ? `NFT metadata inspection ${state.result.state}` : (state.error ?? "")}
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {state.error}
        </p>
      )}

      {state.result && (
        <section aria-label="NFT metadata results" className="space-y-6 rounded-xl border border-white/10 p-5">
          <HostingSummary result={state.result} />

          <div>
            <h2 className="text-sm font-medium">Sampled tokens</h2>
            <div className="mt-2">
              <SampleTable samples={state.result.samples} />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium">Mutability</h2>
            <div className="mt-2">
              <MutabilityPanel mutability={state.result.mutability} />
            </div>
          </div>

          <CoverageNotice coverage={state.result.coverage} warnings={state.result.warnings} />
        </section>
      )}
    </div>
  );
}
