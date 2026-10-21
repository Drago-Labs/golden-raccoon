"use client";

import { LiveRegion } from "@/components/a11y/LiveRegion";
import { CoverageNotice } from "./CoverageNotice";
import { MaintainerChanges } from "./MaintainerChanges";
import { PackageInput } from "./PackageInput";
import { ProvenancePanel } from "./ProvenancePanel";
import { ReleaseTimeline } from "./ReleaseTimeline";
import { useWorkbenchState } from "./useWorkbenchState";

/**
 * Read-only package provenance workbench.
 *
 * Every check is a fresh, self-contained report: the registry already
 * returns full release history, so nothing needs to be held in session
 * state between checks. Nothing is written server-side.
 */
export function PackageProvenance(props: { endpoint?: string }) {
  const { state, check } = useWorkbenchState(props.endpoint ?? "/api/insights/package-provenance");

  const liveMessage =
    state.status === "loading"
      ? "Inspecting package provenance…"
      : state.status === "ready"
        ? `${state.report.packageName}: ${state.report.coverage.note}`
        : state.status === "error"
          ? state.message
          : null;

  return (
    <div className="flex flex-col gap-6">
      <PackageInput busy={state.status === "loading"} onSubmit={check} />

      <LiveRegion message={liveMessage} />

      {state.status === "error" ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" ? (
        <div className="flex flex-col gap-6">
          <CoverageNotice coverage={state.report.coverage} />
          <ReleaseTimeline report={state.report} />
          <ProvenancePanel releases={state.report.releases} />
          <MaintainerChanges maintainerChanges={state.report.maintainerChanges} installScriptChanges={state.report.installScriptChanges} />
        </div>
      ) : null}
    </div>
  );
}
