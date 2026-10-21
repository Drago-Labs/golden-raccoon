"use client";

import { LiveRegion } from "@/components/a11y/LiveRegion";
import { AmountReconciliation } from "./AmountReconciliation";
import { CoverageNotice } from "./CoverageNotice";
import { MessageDetail } from "./MessageDetail";
import { StepTimeline } from "./StepTimeline";
import { TransferInput } from "./TransferInput";
import { useWorkbenchState } from "./useWorkbenchState";

/**
 * Read-only CCTP transfer workbench. Every check is a fresh,
 * self-contained report; nothing is written server-side.
 */
export function CctpTracker(props: { endpoint?: string }) {
  const { state, check } = useWorkbenchState(props.endpoint ?? "/api/insights/cctp-transfers");

  const liveMessage =
    state.status === "loading"
      ? "Tracking transfer…"
      : state.status === "ready"
        ? `${state.report.sourceChain}: ${state.report.coverage.note}`
        : state.status === "error"
          ? state.message
          : null;

  return (
    <div className="flex flex-col gap-6">
      <TransferInput busy={state.status === "loading"} onSubmit={check} />

      <LiveRegion message={liveMessage} />

      {state.status === "error" ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" ? (
        <div className="flex flex-col gap-6">
          <CoverageNotice coverage={state.report.coverage} />
          <StepTimeline report={state.report} />
          <MessageDetail report={state.report} />
          <AmountReconciliation reconciliation={state.report.amountReconciliation} />
        </div>
      ) : null}
    </div>
  );
}
