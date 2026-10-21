"use client";

import { LiveRegion } from "@/components/a11y/LiveRegion";
import { CapacityChart } from "./CapacityChart";
import { CoverageNotice } from "./CoverageNotice";
import { FeePercentiles } from "./FeePercentiles";
import { SurgePeriodList } from "./SurgePeriodList";
import { WindowInput } from "./WindowInput";
import { useWorkbenchState } from "./useWorkbenchState";

/**
 * Read-only explanation of one Stellar ledger window.
 *
 * The chart, the surge list, and the fee tables are separate regions. Classic
 * inclusion fees and Soroban resource fees are never placed in one total.
 */
export function CongestionWorkbench({ endpoint = "/api/insights/network-congestion" }: { endpoint?: string }) {
  const { state, submit } = useWorkbenchState(endpoint);
  const report = state.status === "ready" ? state.report : null;
  const statusMessage =
    state.status === "loading"
      ? "Reading ledgers."
      : state.status === "error"
        ? `The ledger window could not be read. ${state.message}`
        : report
          ? `Window ready. ${report.coverage.presentLedgerCount} ledgers present, ${report.coverage.missingLedgerCount} missing, coverage ${report.coverage.state}.`
          : "";

  return (
    <div className="flex flex-col gap-6">
      <WindowInput busy={state.status === "loading"} onSubmit={submit} />
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p data-testid="congestion-idle" className="text-sm text-white/54">
          Choose a ledger range or a time. The page reads closed ledgers and explains capacity, surge periods, and the inclusion
          fees that were charged. Classic inclusion fees and Soroban resource fees stay separate. Nothing is submitted.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p data-testid="congestion-loading" className="text-sm text-white/54">
          Reading…
        </p>
      ) : null}

      {state.status === "error" ? <CoverageNotice coverage={null} lookup={null} error={{ code: state.code, message: state.message }} /> : null}

      {report ? (
        <>
          <CoverageNotice coverage={report.coverage} lookup={report.lookup} error={null} />

          <section aria-labelledby="capacity-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="capacity-heading" className="text-lg font-semibold">
              Capacity
            </h2>
            <div className="mt-4">
              <CapacityChart capacity={report.capacity} />
            </div>
          </section>

          <section aria-labelledby="surge-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="surge-heading" className="text-lg font-semibold">
              Surge periods
            </h2>
            <div className="mt-4">
              <SurgePeriodList surges={report.surges} />
            </div>
          </section>

          <section aria-labelledby="fees-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="fees-heading" className="text-lg font-semibold">
              Fee percentiles
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Inclusion percentiles are stroops per operation. The Soroban resource percentile is the resource fee in stroops, on its own.
            </p>
            <div className="mt-4">
              <FeePercentiles fees={report.fees} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
