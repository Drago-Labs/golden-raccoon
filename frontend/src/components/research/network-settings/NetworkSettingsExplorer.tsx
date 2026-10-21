"use client";

import { LiveRegion } from "@/components/a11y/LiveRegion";
import { CoverageNotice } from "./CoverageNotice";
import { NetworkSelector } from "./NetworkSelector";
import { SettingsTable } from "./SettingsTable";
import { SnapshotDiff } from "./SnapshotDiff";
import { UpgradeTimeline } from "./UpgradeTimeline";
import { useWorkbenchState } from "./useWorkbenchState";

export function NetworkSettingsExplorer(props: { endpoint?: string }) {
  const workbench = useWorkbenchState(props.endpoint);
  const report = workbench.report;
  const statusMessage = workbench.phase.status === "loading"
    ? `Loading ${workbench.network} settings`
    : workbench.phase.status === "unavailable"
      ? workbench.phase.message
      : workbench.phase.status === "invalid"
        ? workbench.phase.message
        : `${workbench.network} settings loaded`;

  return (
    <div data-testid="network-settings-explorer" className="mx-auto flex w-full max-w-full min-w-0 flex-col gap-6 px-3 py-4 sm:px-6 sm:py-8">
      <header className="min-w-0 border-b border-foreground/15 pb-4">
        <p className="text-xs uppercase tracking-wide text-foreground/60">Soroban insight</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">Network settings</h1>
        <p className="mt-2 max-w-3xl text-sm text-foreground/70">
          Resource limits, fee rates, and archival parameters for one network, and how recorded upgrades changed them.
        </p>
      </header>
      <NetworkSelector
        network={workbench.network}
        disabled={workbench.phase.status === "loading"}
        onChange={workbench.setNetwork}
      />
      <LiveRegion message={statusMessage} politeness={workbench.phase.status === "invalid" ? "assertive" : "polite"} visible />
      <CoverageNotice coverage={report?.coverage ?? null} />
      <SettingsTable
        settings={report?.settings ?? []}
        ledger={report?.ledger ?? null}
        protocolVersion={report?.protocolVersion ?? null}
      />
      <UpgradeTimeline upgrades={report?.history ?? []} />
      <SnapshotDiff
        network={workbench.network}
        upgrades={report?.history ?? []}
        beforeLedger={workbench.beforeLedger}
        afterLedger={workbench.afterLedger}
        changes={workbench.changes}
        onBefore={workbench.setBeforeLedger}
        onAfter={workbench.setAfterLedger}
      />
    </div>
  );
}
