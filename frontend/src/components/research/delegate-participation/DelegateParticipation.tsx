"use client";

import { useState } from "react";
import { CoverageNotice } from "./CoverageNotice";
import { DelegateTable } from "./DelegateTable";
import { DelegationChangeList } from "./DelegationChangeList";
import { GovernanceSelector } from "./GovernanceSelector";
import { PowerChart } from "./PowerChart";
import { useWorkbenchState } from "./useWorkbenchState";

/** The delegate participation workspace: governance, delegates, power, changes, coverage. */
export function DelegateParticipation() {
  const work = useWorkbenchState();
  const [chain, setChain] = useState("ethereum");
  const [tokenAddress, setTokenAddress] = useState("");
  const [governorAddress, setGovernorAddress] = useState("");
  const [delegates, setDelegates] = useState("");
  const report = work.result?.report;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Delegate participation</h1>
      <p>
        Reads a governance token&apos;s delegation events and its governor&apos;s proposals and votes, rebuilds each
        delegate&apos;s voting power over time, and measures participation only over the proposals that delegate held
        power for. It states what delegates did — it does not rank or recommend delegates.
      </p>
      <GovernanceSelector
        chain={chain}
        tokenAddress={tokenAddress}
        governorAddress={governorAddress}
        delegates={delegates}
        busy={work.busy}
        onChainChange={setChain}
        onTokenChange={setTokenAddress}
        onGovernorChange={setGovernorAddress}
        onDelegatesChange={setDelegates}
        onSubmit={() =>
          void work.read({
            chain,
            tokenAddress: tokenAddress.trim(),
            governorAddress: governorAddress.trim(),
            delegates: delegates
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            topChanges: 10,
          })
        }
      />
      <p role="status" aria-live="polite">
        {work.busy
          ? "Reading delegation events, proposals and votes…"
          : work.result?.state === "unsupported_governor" || work.result?.state === "unavailable"
            ? work.result.reason
            : report
              ? `Report ${report.state}. ${report.delegates.length} delegate(s) over ${report.proposals.length} proposal(s).`
              : "Name a governance token and governor to begin."}
      </p>
      {work.error ? <p role="alert">{work.error}</p> : null}
      {report && work.result?.state === "ready" ? (
        <>
          <DelegateTable delegates={report.delegates} />
          <PowerChart delegates={report.delegates} />
          <DelegationChangeList changes={report.largestChanges} />
          <CoverageNotice report={report} />
        </>
      ) : null}
      {report && work.result?.state !== "ready" ? <CoverageNotice report={report} /> : null}
    </div>
  );
}
