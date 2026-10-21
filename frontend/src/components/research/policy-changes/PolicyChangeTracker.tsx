"use client";

import { LiveRegion } from "@/components/a11y/LiveRegion";
import { POLICY_PROJECTS } from "@/server/research/policy-changes/projectRegistry";
import { ChangedFigures } from "./ChangedFigures";
import { CoverageNotice } from "./CoverageNotice";
import { DiffView } from "./DiffView";
import { ProjectSelector } from "./ProjectSelector";
import { SnapshotTimeline } from "./SnapshotTimeline";
import { useWorkbenchState } from "./useWorkbenchState";

/**
 * Read-only policy-change workbench.
 *
 * Prior snapshots stay in session state so a second check can surface drift
 * without claiming the change is good, bad, or deceptive. Nothing is
 * written server-side.
 */
export function PolicyChangeTracker(props: { defaultProjectId?: string; endpoint?: string }) {
  const { state, check } = useWorkbenchState(props.endpoint ?? "/api/insights/policy-changes");

  const liveMessage =
    state.status === "loading"
      ? "Checking for policy changes…"
      : state.status === "ready"
        ? `${state.report.projectLabel}: ${state.report.coverage.note}`
        : state.status === "error"
          ? state.message
          : null;

  return (
    <div className="flex flex-col gap-6">
      <ProjectSelector
        projects={POLICY_PROJECTS}
        defaultProjectId={props.defaultProjectId}
        busy={state.status === "loading"}
        onSubmit={check}
      />

      <LiveRegion message={liveMessage} />

      {state.status === "error" ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" ? (
        <div className="flex flex-col gap-6">
          <CoverageNotice coverage={state.report.coverage} />
          <ChangedFigures figureChanges={state.report.figureChanges} />
          <SnapshotTimeline timeline={state.report.timeline} />
          <DiffView diffs={state.report.diffs} />
        </div>
      ) : null}
    </div>
  );
}
