"use client";

import type { InventoryReport, WorkState } from "@/server/research/privileged-keys";
import { ContractTable } from "./ContractTable";
import { ControllerTable } from "./ControllerTable";
import { CoverageNotice } from "./CoverageNotice";
import { CustodySummary } from "./CustodySummary";
import { ProjectSelector } from "./ProjectSelector";
import { useWorkbenchState } from "./useWorkbenchState";

export function PrivilegedKeyInventory({
  projects,
  initial = null,
}: {
  projects: { id: string; label: string }[];
  initial?: WorkState<InventoryReport> | null;
}) {
  const work = useWorkbenchState(initial);
  const state = work.state;
  return (
    <div className="flex flex-col gap-6">
      <ProjectSelector projects={projects} onSelect={(id) => void work.selectProject(id)} busy={work.busy} />
      {work.error ? <p role="alert">{work.error}</p> : null}
      {state?.kind === "unavailable" ? <p role="status">Provider unavailable: {state.reason}</p> : null}
      {state?.kind === "unknown_format" ? <p role="status">Unknown format: {state.reason}</p> : null}
      {state?.kind === "ready" ? (
        <>
          <CustodySummary summary={state.report.summary} />
          <ControllerTable controllers={state.report.controllers} />
          <ContractTable contracts={state.report.contracts} />
          <CoverageNotice coverage={state.report.coverage} />
        </>
      ) : null}
    </div>
  );
}
