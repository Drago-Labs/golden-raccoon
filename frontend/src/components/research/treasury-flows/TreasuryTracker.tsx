"use client";
import type { TreasuryReport, WorkState } from "@/server/research/treasury-flows";
import { BalanceChart } from "./BalanceChart";
import { CoverageNotice } from "./CoverageNotice";
import { OutflowTable } from "./OutflowTable";
import { ProjectSelector } from "./ProjectSelector";
import { ReportedVsObserved } from "./ReportedVsObserved";
import { useWorkbenchState } from "./useWorkbenchState";
export function TreasuryTracker({ projects, initial = null }: { projects: string[]; initial?: WorkState<TreasuryReport> | null }) {
  const work = useWorkbenchState(initial);
  const state = work.state;
  return (
    <div className="flex flex-col gap-6">
      <ProjectSelector projects={projects} onSelect={(id) => void work.selectProject(id)} busy={work.busy} />
      {state?.kind === "unavailable" ? <p role="status">Provider unavailable: {state.reason}</p> : null}
      {state?.kind === "unknown_format" ? <p role="status">Unknown format: {state.reason}</p> : null}
      {state?.kind === "ready" ? (
        <>
          <BalanceChart balances={state.report.balances} />
          <OutflowTable outflows={state.report.outflows} />
          <ReportedVsObserved comparisons={state.report.comparisons} />
          <CoverageNotice notes={state.report.coverage.notes} />
        </>
      ) : null}
    </div>
  );
}
