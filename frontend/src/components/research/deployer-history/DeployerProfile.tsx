"use client";

import { ContractInput } from "./ContractInput";
import { CoverageNotice } from "./CoverageNotice";
import { DeployerSummary } from "./DeployerSummary";
import { DeploymentTable } from "./DeploymentTable";
import { FundingTrail } from "./FundingTrail";
import { TemplateGroups } from "./TemplateGroups";
import { useWorkbenchState } from "./useWorkbenchState";

export function DeployerProfile() {
  const state = useWorkbenchState();

  return (
    <div className="space-y-6">
      <header className="border-b border-white/10 pb-5">
        <div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">Security insight</div>
        <h1 className="mt-1 text-3xl font-semibold">Contract deployer history</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Finds who deployed a contract, what else they&apos;ve deployed nearby, whether any of it reuses the same
          template, and where their first funding came from — context that otherwise takes several explorer searches
          to assemble.
        </p>
      </header>

      {!state.connected && (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Connect an EVM wallet to run a read-only deployer profile.
        </p>
      )}

      <ContractInput
        connected={state.connected}
        network={state.network}
        onNetwork={state.setNetwork}
        contractAddress={state.contractAddress}
        onContractAddress={state.setContractAddress}
        busy={state.busy}
        onSubmit={state.submit}
      />

      <div aria-live="polite" className="sr-only">
        {state.busy ? "Deployer history loading" : state.result ? `Deployer history ${state.result.state}` : (state.error ?? "")}
      </div>

      {state.error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {state.error}
        </p>
      )}

      {state.result && (
        <section aria-label="Deployer history results" className="space-y-6 rounded-xl border border-white/10 p-5">
          <DeployerSummary lookup={state.result.lookup} />

          {state.result.lookup.deployer && (
            <>
              <div>
                <h2 className="text-sm font-medium">Other deployments nearby</h2>
                <div className="mt-2">
                  <DeploymentTable deployments={state.result.deployments} coverage={state.result.coverage.deploymentScan} />
                </div>
              </div>

              <div>
                <h2 className="text-sm font-medium">Template reuse</h2>
                <div className="mt-2">
                  <TemplateGroups groups={state.result.templateGroups} flaggedMatches={state.result.flaggedMatches} />
                </div>
              </div>

              <div>
                <h2 className="text-sm font-medium">Funding trail</h2>
                <div className="mt-2">
                  <FundingTrail hops={state.result.fundingTrail} />
                </div>
              </div>
            </>
          )}

          <CoverageNotice coverage={state.result.coverage} warnings={state.result.warnings} />
        </section>
      )}
    </div>
  );
}
