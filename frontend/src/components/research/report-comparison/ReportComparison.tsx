"use client";

import { useEffect, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { FactorChanges } from "./FactorChanges";
import { ScoreDeltaTable } from "./ScoreDeltaTable";
import { SnapshotSelector } from "./SnapshotSelector";
import { SourceChanges } from "./SourceChanges";
import type { ReportComparison as Comparison } from "@/server/research/report-comparison/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; comparison: Comparison }
  | { status: "error"; code: string; message: string };

/**
 * Snapshot comparison workspace.
 *
 * The wrapper remounts the session component whenever the active account or
 * network changes, so no comparison derived from a previous wallet session can
 * remain on screen, and a response that resolves after the switch is discarded
 * by the generation guard inside.
 */
export function ReportComparison(props: {
  account?: string | null;
  network?: string | null;
  initialLeftId?: string;
  initialRightId?: string;
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <ComparisonSession
      key={sessionKey}
      sessionKey={sessionKey}
      initialLeftId={props.initialLeftId}
      initialRightId={props.initialRightId}
      endpoint={props.endpoint ?? "/api/insights/report-comparison"}
    />
  );
}

function ComparisonSession({
  sessionKey,
  initialLeftId,
  initialRightId,
  endpoint,
}: {
  sessionKey: string;
  initialLeftId?: string;
  initialRightId?: string;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [pending, setPending] = useState<{ leftId: string; rightId: string } | null>(
    initialLeftId && initialRightId ? { leftId: initialLeftId, rightId: initialRightId } : null,
  );
  const generation = useRef(0);

  useEffect(() => {
    if (!pending) return;

    generation.current += 1;
    const requestGeneration = generation.current;
    const query = new URLSearchParams({ leftId: pending.leftId, rightId: pending.rightId });

    Promise.resolve()
      .then(() => {
        if (requestGeneration !== generation.current) return null;
        setState({ status: "loading" });
        return fetch(`${endpoint}?${query.toString()}`, { cache: "no-store" });
      })
      .then(async (response) => {
        if (!response || requestGeneration !== generation.current) return;

        const payload = await response.json();

        if (requestGeneration !== generation.current) return;

        if (!response.ok) {
          setState({
            status: "error",
            code: typeof payload?.error === "string" ? payload.error : "comparison_failed",
            message: typeof payload?.message === "string" ? payload.message : "The snapshots could not be compared.",
          });
          return;
        }

        setState({ status: "ready", comparison: payload.comparison });
      })
      .catch(() => {
        if (requestGeneration !== generation.current) return;
        setState({ status: "error", code: "network_error", message: "The comparison request could not be completed." });
      });

    return () => {
      generation.current += 1;
    };
  }, [endpoint, pending, sessionKey]);

  const comparison = state.status === "ready" ? state.comparison : null;
  const leftLabel = comparison ? `Earlier · ${comparison.left.generatedAt}` : "Earlier";
  const rightLabel = comparison ? `Later · ${comparison.right.generatedAt}` : "Later";

  const statusMessage =
    state.status === "loading"
      ? "Comparing the two snapshots."
      : state.status === "error"
        ? `Comparison failed: ${state.message}`
        : comparison
          ? comparison.materiallyIdentical
            ? "Comparison ready. The two observations are materially identical."
            : `Comparison ready. ${comparison.coverage.changedFactors} narrative changes and ${comparison.coverage.lostSources} lost sources.`
          : "";

  return (
    <div className="space-y-6" data-testid="report-comparison">
      <LiveRegion message={statusMessage} />

      <section aria-labelledby="comparison-selector-heading" className="rounded-xl border border-white/10 p-4">
        <h2 id="comparison-selector-heading" className="text-sm font-semibold">
          Choose two snapshots
        </h2>
        <div className="mt-3">
          <SnapshotSelector
            initialLeftId={initialLeftId}
            initialRightId={initialRightId}
            busy={state.status === "loading"}
            onCompare={(leftId, rightId) => setPending({ leftId, rightId })}
          />
        </div>
      </section>

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No comparison yet. Enter two snapshot ids for the same asset on the same network.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Comparing snapshots…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">These snapshots could not be compared.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {comparison ? (
        <>
          <section aria-labelledby="comparison-subject-heading" className="rounded-xl border border-white/10 p-4">
            <h2 id="comparison-subject-heading" className="text-sm font-semibold">
              {comparison.asset.symbol} on {comparison.asset.network}
            </h2>
            <p className="mt-1 break-all font-mono text-[11px] text-subtle">{comparison.asset.identityKey}</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <dt className="text-subtle">Earlier observation</dt>
                <dd>
                  {comparison.left.generatedAt}
                  <span className="block break-all font-mono text-[11px] text-subtle">{comparison.left.snapshotId}</span>
                </dd>
              </div>
              <div>
                <dt className="text-subtle">Later observation</dt>
                <dd>
                  {comparison.right.generatedAt}
                  <span className="block break-all font-mono text-[11px] text-subtle">{comparison.right.snapshotId}</span>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-subtle">
              Coverage: {comparison.coverage.state}. {comparison.coverage.note}
            </p>
            {comparison.comparability.caveats.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-subtle">
                {comparison.comparability.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            ) : null}
            {comparison.materiallyIdentical ? (
              <p className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs" data-testid="materially-identical">
                No material difference. Score, verdict, narrative items and evidence sources all match.
              </p>
            ) : null}
          </section>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showUnchanged}
              onChange={(event) => setShowUnchanged(event.target.checked)}
              className="h-4 w-4"
            />
            Show unchanged rows
          </label>

          <section aria-labelledby="comparison-scores-heading">
            <h2 id="comparison-scores-heading" className="text-sm font-semibold">Scores and verdict</h2>
            <div className="mt-3">
              <ScoreDeltaTable scores={comparison.scores} verdict={comparison.verdict} leftLabel={leftLabel} rightLabel={rightLabel} />
            </div>
          </section>

          <section aria-labelledby="comparison-factors-heading">
            <h2 id="comparison-factors-heading" className="text-sm font-semibold">Narrative changes</h2>
            <div className="mt-3">
              <FactorChanges factors={comparison.factors} leftLabel={leftLabel} rightLabel={rightLabel} showUnchanged={showUnchanged} />
            </div>
          </section>

          <section aria-labelledby="comparison-sources-heading">
            <h2 id="comparison-sources-heading" className="text-sm font-semibold">Evidence sources</h2>
            <div className="mt-3">
              <SourceChanges sources={comparison.sources} leftLabel={leftLabel} rightLabel={rightLabel} showUnchanged={showUnchanged} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
