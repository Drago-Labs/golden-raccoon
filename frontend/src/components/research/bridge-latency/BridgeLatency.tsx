"use client";
import type { BridgeReport, WorkState } from "@/server/research/bridge-latency";
import { BridgeSelector } from "./BridgeSelector";
import { CoverageNotice } from "./CoverageNotice";
import { LatencyChart } from "./LatencyChart";
import { RouteTable } from "./RouteTable";
import { StuckTransferList } from "./StuckTransferList";
import { useWorkbenchState } from "./useWorkbenchState";
export function BridgeLatency({ bridges, initial = null }: { bridges: string[]; initial?: WorkState<BridgeReport> | null }) {
  const work = useWorkbenchState(initial);
  const state = work.state;
  return (
    <div className="flex flex-col gap-6">
      <BridgeSelector bridges={bridges} onSelect={(bridge) => void work.selectBridge(bridge)} busy={work.busy} />
      {state?.kind === "unavailable" ? <p role="status">Provider unavailable: {state.reason}</p> : null}
      {state?.kind === "unknown_format" ? <p role="status">Unknown format: {state.reason}</p> : null}
      {state?.kind === "ready" ? (
        <>
          <RouteTable routes={state.report.routes} />
          <LatencyChart routes={state.report.routes} />
          <StuckTransferList stuck={state.report.stuck} />
          <CoverageNotice notes={state.report.coverage.notes} />
        </>
      ) : null}
    </div>
  );
}
