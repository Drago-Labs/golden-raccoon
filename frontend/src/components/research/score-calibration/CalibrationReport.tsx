"use client";

import { LiveRegion } from "@/components/a11y/LiveRegion";
import { BucketDetail } from "./BucketDetail";
import { CalibrationChart } from "./CalibrationChart";
import { CoverageNotice } from "./CoverageNotice";
import { ExclusionNotice } from "./ExclusionNotice";
import { HorizonSelector } from "./HorizonSelector";
import { useWorkbenchState } from "./useWorkbenchState";

/** Read-only calibration workbench. Every build is a fresh report; nothing is written server-side. */
export function CalibrationReport(props: { endpoint?: string }) {
  const { state, check } = useWorkbenchState(props.endpoint ?? "/api/insights/score-calibration");

  const liveMessage =
    state.status === "loading"
      ? "Building calibration report…"
      : state.status === "ready"
        ? state.report.coverage.note
        : state.status === "error"
          ? state.message
          : null;

  return (
    <div className="flex flex-col gap-6">
      <HorizonSelector busy={state.status === "loading"} onSubmit={check} />

      <LiveRegion message={liveMessage} />

      {state.status === "error" ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" ? (
        <div className="flex flex-col gap-6">
          <CoverageNotice coverage={state.report.coverage} />
          <CalibrationChart buckets={state.report.buckets} />
          <section data-testid="bucket-detail" className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-muted">Bucket detail</h2>
            <ul className="flex flex-col gap-3">
              {state.report.buckets.map((bucket) => (
                <BucketDetail key={bucket.bucket.label} bucket={bucket} />
              ))}
            </ul>
          </section>
          <ExclusionNotice excludedSnapshots={state.report.excludedSnapshots} />
        </div>
      ) : null}
    </div>
  );
}
