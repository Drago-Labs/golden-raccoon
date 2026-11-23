"use client";
import type { IntegrityReport, WorkState } from "@/server/research/frontend-integrity";
import { CoverageNotice } from "./CoverageNotice";
import { DomainInput } from "./DomainInput";
import { HeaderTable } from "./HeaderTable";
import { SnapshotDiffView } from "./SnapshotDiff";
import { SnapshotList } from "./SnapshotList";
import { useWorkbenchState } from "./useWorkbenchState";

export function FrontendIntegrity({ initial = null }: { initial?: WorkState<IntegrityReport> | null }) {
  const work = useWorkbenchState(initial);
  const state = work.state;
  return (
    <div className="flex flex-col gap-6">
      <DomainInput onInspect={(domain) => void work.inspect(domain)} busy={work.busy} />
      {state?.kind === "unavailable" ? <p role="status">Provider unavailable: {state.reason}</p> : null}
      {state?.kind === "unknown_format" ? <p role="status">Unknown format: {state.reason}</p> : null}
      {state?.kind === "ready" ? (
        <>
          <SnapshotList scripts={state.report.current.scripts} />
          <SnapshotDiffView diff={state.report.diff} />
          <HeaderTable headers={state.report.current.headers} />
          <ul>{state.report.findings.map((finding) => <li key={`${finding.kind}:${finding.detail}`}>{finding.kind}: {finding.detail}</li>)}</ul>
          <CoverageNotice notes={state.report.coverage.notes} />
        </>
      ) : null}
    </div>
  );
}
