"use client";

import type { FormEvent } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { formatSharePercent } from "@/server/research/stellar-holders/concentration";
import type { ConcentrationReport, ExactRatio } from "@/server/research/stellar-holders/schema";
import { AssetInput } from "./AssetInput";
import { CoverageNotice } from "./CoverageNotice";
import { DistributionChart } from "./DistributionChart";
import { HolderTable } from "./HolderTable";
import { SupplyBuckets } from "./SupplyBuckets";
import { useWorkbenchState } from "./useWorkbenchState";

type Props = {
  initialAsset?: string;
  initialNetwork?: string;
  endpoint?: string;
};

/**
 * Read-only workbench for one issued asset. Switching the asset or the
 * network drops the previous report before a new read starts.
 */
export function HolderDistribution(props: Props) {
  const workbench = useWorkbenchState(props.initialAsset ?? "", props.initialNetwork ?? "stellar-testnet", props.endpoint);
  const report = workbench.state.status === "ready" ? workbench.state.report : null;
  const statusMessage = workbench.state.status === "loading"
    ? "Reading trustlines, liquidity pools, and claimable balances."
    : workbench.state.status === "error"
      ? workbench.state.message
      : report
        ? `Distribution ${report.state} for ${report.asset?.canonical ?? "the asset"} on ${report.network}.`
        : "";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    workbench.analyse();
  }

  return (
    <div className="flex flex-col gap-6">
      <AssetInput
        asset={workbench.asset}
        network={workbench.network}
        busy={workbench.state.status === "loading"}
        onAsset={workbench.setAsset}
        onNetwork={workbench.setNetwork}
        onSubmit={onSubmit}
      />
      <LiveRegion message={statusMessage} politeness={workbench.state.status === "error" ? "assertive" : "polite"} />

      {workbench.state.status === "idle" ? (
        <p data-testid="holder-idle" className="text-sm text-white/60">
          Enter CODE:ISSUER and a network. The read counts trustlines, liquidity pools, and claimable balances separately,
          and it does not submit a transaction.
        </p>
      ) : null}

      {workbench.state.status === "loading" ? (
        <p role="status" className="text-sm text-white/70">Reading holder supply.</p>
      ) : null}

      {workbench.state.status === "error" ? (
        <p role="alert" data-testid="holder-error" className="text-sm text-red-200">{workbench.state.message}</p>
      ) : null}

      {report ? (
        <>
          <CoverageNotice coverage={report.coverage} ledger={report.ledger} />
          {report.concentration ? (
            <section aria-labelledby="concentration-heading" data-testid="concentration-summary" className="grid gap-4 sm:grid-cols-2">
              <h2 id="concentration-heading" className="sr-only">Concentration</h2>
              <ConcentrationCard title="All trustline accounts" concentration={report.concentration.accounts} />
              <ConcentrationCard title="Public float" concentration={report.concentration.publicFloat} />
            </section>
          ) : null}
          {report.supply ? <SupplyBuckets supply={report.supply} /> : null}
          <DistributionChart holders={report.holders} />
          <HolderTable holders={report.holders} />
          {report.issuerAdjacency ? (
            <p className="text-xs text-white/55">
              Issuer {report.issuerAdjacency.issuer}. Distribution accounts: {report.issuerAdjacency.distributionAccounts.join(", ") || "none declared"}.
              {report.issuerAdjacency.tomlRead ? " Read from stellar.toml." : " stellar.toml was not read."}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ConcentrationCard({ title, concentration }: { title: string; concentration: ConcentrationReport }) {
  return (
    <article className="rounded-2xl border border-white/10 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {concentration.defined ? (
        <dl className="mt-3 grid gap-2 text-sm">
          <Metric label="Holders" value={String(concentration.holderCount)} />
          <Metric label="Top 1 share" value={shareText(concentration.topShares.find((share) => share.n === 1)?.share)} />
          <Metric label="Gini" value={ratioText(concentration.gini)} />
          <Metric label="Herfindahl" value={ratioText(concentration.herfindahl)} />
        </dl>
      ) : (
        <p className="mt-3 text-sm text-white/60">Not defined. There is no positive balance in this group.</p>
      )}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-white/55">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function ratioText(ratio: ExactRatio | undefined): string {
  if (!ratio || ratio.denominator === "0") return "n/a";

  return `${ratio.numerator}/${ratio.denominator} (${formatSharePercent(ratio)})`;
}

function shareText(ratio: ExactRatio | undefined): string {
  return ratioText(ratio);
}
