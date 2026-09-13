"use client";

import { useCallback, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import { CostTimeline } from "./CostTimeline";
import { CoverageTable } from "./CoverageTable";
import { FeeBreakdown } from "./FeeBreakdown";
import { PeriodSelector, type PeriodSelection } from "./PeriodSelector";
import type { FeeAnalysisReport, OperationCategory } from "@/server/research/fee-analysis/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: FeeAnalysisReport }
  | { status: "error"; code: string; message: string };

const CATEGORY_LABELS: Record<OperationCategory, string> = {
  swap: "Swaps",
  approval: "Approvals",
  transfer: "Transfers",
  trustline: "Trustlines",
  agent_log: "Agent logs",
  other: "Other",
};

const COVERAGE_TONES: Record<FeeAnalysisReport["coverage"]["state"], "success" | "warning" | "danger" | "neutral"> = {
  complete: "success",
  partial: "warning",
  empty: "neutral",
  unavailable: "danger",
};

/**
 * Retrospective fee attribution workspace.
 *
 * Keyed by account and network, so switching either discards the report. What
 * this component deliberately never renders is a single cross-asset total:
 * `FeeBreakdown` has no such column, and the reason a combined figure is
 * unavailable is rendered from the report rather than assumed.
 */
export function FeeAnalysisWorkspace(props: {
  account?: string | null;
  stellarAccount?: string | null;
  network?: string | null;
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <WorkspaceSession
      key={sessionKey}
      account={props.account ?? ""}
      stellarAccount={props.stellarAccount ?? null}
      network={props.network ?? null}
      endpoint={props.endpoint ?? "/api/insights/fee-analysis"}
    />
  );
}

function WorkspaceSession({
  account,
  stellarAccount,
  network,
  endpoint,
}: {
  account: string;
  stellarAccount: string | null;
  network: string | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const generation = useRef(0);

  const analyse = useCallback(
    (period: PeriodSelection) => {
      if (!account) {
        setState({ status: "error", code: "no_wallet", message: "Connect a wallet to analyse its fees." });
        return;
      }

      generation.current += 1;
      const requestGeneration = generation.current;

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: account,
          ...(stellarAccount ? { stellarAccount } : {}),
          ...(network ? { network } : {}),
          from: period.from,
          to: period.to,
          bucket: period.bucket,
        }),
      })
        .then(async (response) => {
          const body = await response.json();

          // Dropped when a newer period has been requested, so a slow response
          // for one wallet cannot repaint another's numbers.
          if (requestGeneration !== generation.current) return;

          if (!response.ok) {
            setState({
              status: "error",
              code: typeof body?.error === "string" ? body.error : "fee_analysis_failed",
              message: typeof body?.message === "string" ? body.message : "The fee analysis could not be completed.",
            });
            return;
          }

          setState({ status: "ready", report: body.report });
        })
        .catch(() => {
          if (requestGeneration !== generation.current) return;
          setState({ status: "error", code: "network_error", message: "The analysis request could not be completed." });
        });
    },
    [account, endpoint, network, stellarAccount],
  );

  const report = state.status === "ready" ? state.report : null;

  const statusMessage =
    state.status === "loading"
      ? "Reading receipts and transaction metadata."
      : state.status === "error"
        ? `Analysis failed: ${state.message}`
        : report
          ? `Analysis ready. ${report.coverage.observedCount} of ${report.coverage.chargeCount} charges observed across ${report.byNetwork.length} network${report.byNetwork.length === 1 ? "" : "s"}. Coverage is ${report.coverage.state}.`
          : "";

  return (
    <div className="flex flex-col gap-6">
      <PeriodSelector busy={state.status === "loading"} onSubmit={analyse} />

      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p data-testid="fee-idle" className="text-sm text-white/54">
          Choose a period to attribute the network fees this wallet has already paid. Nothing is submitted and no fee policy
          changes.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p data-testid="fee-loading" className="text-sm text-white/54">
          Reading…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div data-testid="fee-error" role="alert" className="glass-panel rounded-[28px] p-5 text-sm text-red-200">
          <p className="font-semibold">The fee analysis could not be completed.</p>
          <p className="mt-1 text-white/70">{state.message}</p>
          <p className="mt-2 text-xs text-white/42">Error code: {state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <section data-testid="fee-summary" aria-labelledby="fee-summary-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="fee-summary-heading" className="text-xl font-semibold">
                Fees paid
              </h2>
              <StatusBadge tone={COVERAGE_TONES[report.coverage.state]}>{report.coverage.state} coverage</StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/70">{report.coverage.note}</p>
            <p className="mt-2 text-xs text-white/42">
              {report.window.from.slice(0, 10)} to {report.window.to.slice(0, 10)} · {report.coverage.recordCount} record(s) ·{" "}
              {report.coverage.excludedCount} excluded
            </p>
            {report.fiatUnavailableReason ? (
              <p
                data-testid="fiat-unavailable"
                className="mt-3 rounded-2xl border border-[#d9a441]/30 bg-[#d9a441]/8 px-4 py-3 text-xs leading-5 text-[#f2c86d]"
              >
                {report.fiatUnavailableReason}
              </p>
            ) : null}
          </section>

          <section data-testid="fee-by-network" aria-labelledby="fee-network-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="fee-network-heading" className="text-lg font-semibold">
              By network
            </h2>
            <div className="mt-4 flex flex-col gap-6">
              {report.byNetwork.map((network) => (
                <div key={network.network}>
                  <h3 className="text-sm font-medium text-white/70">
                    {network.network} · {network.chargeCount} charge{network.chargeCount === 1 ? "" : "s"}
                  </h3>
                  <div className="mt-2">
                    <FeeBreakdown totals={network.byAsset} caption={`Fees charged on ${network.network}, per asset`} />
                  </div>
                </div>
              ))}
              {report.byNetwork.length === 0 ? <p className="text-sm text-white/54">No charge was attributed in this window.</p> : null}
            </div>
          </section>

          {report.byCategory.length > 0 ? (
            <section data-testid="fee-by-category" aria-labelledby="fee-category-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
              <h2 id="fee-category-heading" className="text-lg font-semibold">
                By operation
              </h2>
              <div className="mt-4 flex flex-col gap-6">
                {report.byCategory.map((category) => (
                  <div key={category.category}>
                    <h3 className="text-sm font-medium text-white/70">
                      {CATEGORY_LABELS[category.category]} · {category.chargeCount} charge
                      {category.chargeCount === 1 ? "" : "s"}
                    </h3>
                    <div className="mt-2">
                      <FeeBreakdown totals={category.byAsset} caption={`Fees charged for ${CATEGORY_LABELS[category.category]}, per asset`} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="fee-timeline-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="fee-timeline-heading" className="text-lg font-semibold">
              Over time
            </h2>
            <div className="mt-4">
              <CostTimeline timeline={report.timeline} />
            </div>
          </section>

          <section aria-labelledby="fee-coverage-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="fee-coverage-heading" className="text-lg font-semibold">
              What the totals do not cover
            </h2>
            <div className="mt-4">
              <CoverageTable charges={report.charges} excluded={report.excluded} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
