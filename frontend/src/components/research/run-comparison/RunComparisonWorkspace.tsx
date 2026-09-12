"use client";

import { useCallback, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import { AgentDifferenceTable } from "./AgentDifferenceTable";
import { InputChangesPanel } from "./InputChangesPanel";
import { QualityChangesPanel } from "./QualityChangesPanel";
import { RunPairSelector, type RunOption } from "./RunPairSelector";
import type { Comparability, RunComparisonReport } from "@/server/research/run-comparison/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: RunComparisonReport }
  | { status: "error"; code: string; message: string };

const COMPARABILITY_TONES: Record<Comparability, "success" | "warning" | "danger" | "neutral"> = {
  comparable: "success",
  different_subject: "danger",
  different_mode: "warning",
  incomparable: "neutral",
};

/**
 * Side-by-side run investigation workspace.
 *
 * The session is keyed by account and network, so switching either discards
 * the comparison. Nothing here starts an agent: the only request it can make
 * is a read of two stored runs.
 */
export function RunComparisonWorkspace(props: {
  account?: string | null;
  network?: string | null;
  runs?: RunOption[];
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <ComparisonSession
      key={sessionKey}
      account={props.account ?? ""}
      network={props.network ?? null}
      runs={props.runs ?? []}
      endpoint={props.endpoint ?? "/api/insights/run-comparison"}
    />
  );
}

function ComparisonSession({
  account,
  network,
  runs,
  endpoint,
}: {
  account: string;
  network: string | null;
  runs: RunOption[];
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const generation = useRef(0);

  const compare = useCallback(
    (pair: { leftRunId: string; rightRunId: string }) => {
      if (!account) {
        setState({ status: "error", code: "no_wallet", message: "Connect a wallet to compare its saved runs." });
        return;
      }

      generation.current += 1;
      const requestGeneration = generation.current;

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: account, ...(network ? { network } : {}), ...pair }),
      })
        .then(async (response) => {
          const body = await response.json();

          // Dropped when a newer pair has been requested, so a slow comparison
          // cannot repaint a view the user has moved past.
          if (requestGeneration !== generation.current) return;

          if (!response.ok) {
            setState({
              status: "error",
              code: typeof body?.error === "string" ? body.error : "run_comparison_failed",
              message: typeof body?.message === "string" ? body.message : "The runs could not be compared.",
            });
            return;
          }

          setState({ status: "ready", report: body.report });
        })
        .catch(() => {
          if (requestGeneration !== generation.current) return;
          setState({ status: "error", code: "network_error", message: "The comparison request could not be completed." });
        });
    },
    [account, endpoint, network],
  );

  const report = state.status === "ready" ? state.report : null;

  const statusMessage =
    state.status === "loading"
      ? "Reading the two saved runs."
      : state.status === "error"
        ? `Comparison failed: ${state.message}`
        : report
          ? `Comparison ready. ${report.coverage.agentsCompared} agent(s) aligned, ${report.coverage.agentsInOneRunOnly} in one run only, ${report.coverage.ambiguousFindingCount} undetermined finding pairing(s).`
          : "";

  return (
    <div className="flex flex-col gap-6">
      <RunPairSelector runs={runs} busy={state.status === "loading"} onCompare={compare} />

      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p data-testid="comparison-idle" className="text-sm text-white/54">
          Choose two saved runs to investigate what differs between them. Nothing is re-run and no provider is contacted.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p data-testid="comparison-loading" className="text-sm text-white/54">
          Reading…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div data-testid="comparison-error" role="alert" className="glass-panel rounded-[28px] p-5 text-sm text-red-200">
          <p className="font-semibold">The runs could not be compared.</p>
          <p className="mt-1 text-white/70">{state.message}</p>
          <p className="mt-2 text-xs text-white/42">Error code: {state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <section data-testid="comparison-summary" aria-labelledby="comparison-summary-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="comparison-summary-heading" className="text-xl font-semibold">
                What differs
              </h2>
              <StatusBadge tone={COMPARABILITY_TONES[report.comparability]}>{report.comparability.replace(/_/g, " ")}</StatusBadge>
              <StatusBadge tone="neutral">{report.coverage.state} coverage</StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/70">{report.comparabilityNote}</p>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-white/42">First run</dt>
                <dd className="mt-0.5 break-all font-mono text-white/78">
                  {report.left.runId}
                  <span className="mt-0.5 block font-sans text-white/42">{report.left.createdAt}</span>
                </dd>
              </div>
              <div>
                <dt className="text-white/42">Second run</dt>
                <dd className="mt-0.5 break-all font-mono text-white/78">
                  {report.right.runId}
                  <span className="mt-0.5 block font-sans text-white/42">{report.right.createdAt}</span>
                </dd>
              </div>
            </dl>

            <div data-testid="recommendation-change" className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
              <p className="text-white/80">
                Recommendation: {report.recommendationChange.before} → {report.recommendationChange.after}
              </p>
              <p className="mt-1 text-xs text-white/54">
                Decision score {report.decisionScoreChange.before} → {report.decisionScoreChange.after} (
                {report.decisionScoreChange.delta > 0 ? "+" : ""}
                {report.decisionScoreChange.delta})
              </p>
            </div>

            <p className="mt-3 rounded-2xl border border-[#d9a441]/30 bg-[#d9a441]/8 px-4 py-3 text-xs leading-5 text-[#f2c86d]">
              This shows what changed, not why. A saved run records what was observed, not what caused an observation to
              differ, so no cause is inferred here — including where a score moved and provider coverage dropped together.
            </p>
            <p className="mt-2 text-xs text-white/42">{report.coverage.note}</p>
          </section>

          <section aria-labelledby="comparison-inputs-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="comparison-inputs-heading" className="text-lg font-semibold">
              Inputs
            </h2>
            <div className="mt-4">
              <InputChangesPanel differences={report.inputDifferences} />
            </div>
          </section>

          <section aria-labelledby="comparison-agents-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="comparison-agents-heading" className="text-lg font-semibold">
              Agents
            </h2>
            <div className="mt-4">
              <AgentDifferenceTable differences={report.agentDifferences} />
            </div>
          </section>

          <section aria-labelledby="comparison-quality-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="comparison-quality-heading" className="text-lg font-semibold">
              Provider coverage
            </h2>
            <p className="mt-1 text-xs leading-5 text-white/42">
              A different fact from a changed score, kept in its own panel with the timestamps each measurement was taken at.
            </p>
            <div className="mt-4">
              <QualityChangesPanel changes={report.qualityChanges} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
