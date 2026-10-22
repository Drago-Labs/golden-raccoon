"use client";

import { ClaimStatus } from "./ClaimStatus";
import { CoverageNotice } from "./CoverageNotice";
import { DistributorInput } from "./DistributorInput";
import { ProofSteps } from "./ProofSteps";
import { RootComparison } from "./RootComparison";
import { useWorkbenchState } from "./useWorkbenchState";

export function ClaimVerifier() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      <header className="border-b border-white/10 pb-5">
        <div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">Security insight</div>
        <h1 className="mt-1 text-3xl font-semibold">Merkle distributor claim verification</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Checks an address&apos;s claim against a published tree file, the distributor&apos;s on-chain root, and
          its claimed bitmap — so a phishing site asking you to sign a claim transaction that was never actually in
          the distribution is visible before you sign, not after.
        </p>
      </header>

      {!state.connected && (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Connect an EVM wallet to run a read-only claim check.
        </p>
      )}

      <DistributorInput
        connected={state.connected}
        network={state.network}
        onNetwork={state.setNetwork}
        distributorAddress={state.distributorAddress}
        onDistributorAddress={state.setDistributorAddress}
        claimAddress={state.claimAddress}
        onClaimAddress={state.setClaimAddress}
        treeSource={state.treeSource}
        onTreeSource={state.setTreeSource}
        leafEncoding={state.leafEncoding}
        onLeafEncoding={state.setLeafEncoding}
        blockNumber={state.blockNumber}
        onBlockNumber={state.setBlockNumber}
        busy={state.busy}
        onSubmit={state.submit}
      />

      <div aria-live="polite" className="sr-only">
        {state.busy ? "Claim verification loading" : state.result ? `Claim verification ${state.result.state}` : (state.error ?? "")}
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {state.error}
        </p>
      )}

      {state.result && (
        <section aria-label="Merkle claim results" className="space-y-6 rounded-xl border border-white/10 p-5">
          <ClaimStatus result={state.result} />

          <div>
            <h2 className="text-sm font-medium">Root comparison</h2>
            <div className="mt-2">
              <RootComparison result={state.result} />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium">Proof</h2>
            <div className="mt-2">
              <ProofSteps result={state.result} />
            </div>
          </div>

          <CoverageNotice coverage={state.result.coverage} warnings={state.result.warnings} />
        </section>
      )}
    </div>
  );
}
