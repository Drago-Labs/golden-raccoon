"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { ClaimCoverageTable } from "./ClaimCoverageTable";
import { ConflictInspector } from "./ConflictInspector";
import { FreshnessTimeline } from "./FreshnessTimeline";
import { SourceFamilyPanel } from "./SourceFamilyPanel";
import type { EvidenceReport } from "@/server/research/evidence-coverage/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: EvidenceReport }
  | { status: "error"; code: string; message: string };

export type EvidenceInput = {
  reportId: string;
  generatedAt: string;
  staleAfterSeconds?: number;
  families?: unknown[];
  claims: unknown[];
};

/**
 * Evidence coverage and contradiction explorer.
 *
 * The wrapper remounts the session component on any account or network change,
 * so nothing derived from a previous wallet survives; the generation guard
 * inside discards a response that resolves after the switch.
 */
export function EvidenceExplorer(props: {
  input?: EvidenceInput | null;
  account?: string | null;
  network?: string | null;
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <ExplorerSession
      key={sessionKey}
      sessionKey={sessionKey}
      input={props.input ?? null}
      endpoint={props.endpoint ?? "/api/insights/evidence-coverage"}
    />
  );
}

function ExplorerSession({
  sessionKey,
  input,
  endpoint,
}: {
  sessionKey: string;
  input: EvidenceInput | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (!input) return;

    generation.current += 1;
    const requestGeneration = generation.current;

    Promise.resolve()
      .then(() => {
        if (requestGeneration !== generation.current) return null;
        setState({ status: "loading" });

        return fetch(endpoint, {
          method: "POST",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
      })
      .then(async (response) => {
        if (!response || requestGeneration !== generation.current) return;

        const payload = await response.json();

        if (requestGeneration !== generation.current) return;

        if (!response.ok) {
          setState({
            status: "error",
            code: typeof payload?.error === "string" ? payload.error : "evidence_analysis_failed",
            message: typeof payload?.message === "string" ? payload.message : "The evidence could not be analysed.",
          });
          return;
        }

        setState({ status: "ready", report: payload.report });
        setSelectedClaimId(payload.report?.claims?.[0]?.claimId ?? null);
      })
      .catch(() => {
        if (requestGeneration !== generation.current) return;
        setState({ status: "error", code: "network_error", message: "The analysis request could not be completed." });
      });

    return () => {
      generation.current += 1;
    };
  }, [endpoint, input, sessionKey]);

  const report = state.status === "ready" ? state.report : null;

  const selectedObservations = useMemo(() => {
    if (!report) return [];
    const claim = report.claims.find((entry) => entry.claimId === selectedClaimId);
    if (!claim) return report.observations;
    return report.observations.filter((observation) => claim.observationIds.includes(observation.observationId));
  }, [report, selectedClaimId]);

  const selectedConflicts = useMemo(() => {
    if (!report || !selectedClaimId) return { contradictions: [], incomparablePairs: [] };
    return {
      contradictions: report.contradictions.filter((entry) => entry.claimId === selectedClaimId),
      incomparablePairs: report.incomparablePairs.filter((entry) => entry.claimId === selectedClaimId),
    };
  }, [report, selectedClaimId]);

  const statusMessage =
    state.status === "loading"
      ? "Analysing evidence coverage."
      : state.status === "error"
        ? `Analysis failed: ${state.message}`
        : report
          ? `Analysis ready. ${report.coverage.corroboratedClaimCount} of ${report.coverage.claimCount} claims corroborated. Coverage is ${report.coverage.state}.`
          : "";

  return (
    <div className="space-y-6" data-testid="evidence-explorer">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No report is loaded. Open this explorer from a source snapshot list to see which claims have independent
          coverage and which rest on a single source family.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Analysing evidence coverage…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">The evidence could not be analysed.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <section aria-labelledby="evidence-summary-heading" className="rounded-xl border border-white/10 p-4">
            <h2 id="evidence-summary-heading" className="text-sm font-semibold">
              Report {report.reportId}
            </h2>
            <p className="mt-1 text-xs text-subtle">Generated at {report.generatedAt}</p>
            <p className="mt-2 text-xs text-subtle">
              Coverage: {report.coverage.state}. {report.coverage.note}
            </p>
            {report.coverage.redactedFieldCount > 0 ? (
              <p className="mt-2 text-xs text-subtle" data-testid="redaction-summary">
                {report.coverage.redactedFieldCount} provider payload field
                {report.coverage.redactedFieldCount === 1 ? " was" : "s were"} dropped before presentation. Provider
                payloads are denied wholesale, not filtered.
              </p>
            ) : null}
          </section>

          <section aria-labelledby="evidence-claims-heading">
            <h2 id="evidence-claims-heading" className="text-sm font-semibold">
              Claims ({report.claims.length})
            </h2>
            <div className="mt-3">
              <ClaimCoverageTable claims={report.claims} selectedClaimId={selectedClaimId} onSelect={setSelectedClaimId} />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <ConflictInspector
              contradictions={selectedConflicts.contradictions}
              incomparablePairs={selectedConflicts.incomparablePairs}
              observations={report.observations}
            />

            <div className="space-y-6">
              <SourceFamilyPanel families={report.families} observations={report.observations} />

              <section aria-labelledby="evidence-timeline-heading">
                <h3 id="evidence-timeline-heading" className="text-sm font-semibold">
                  Freshness timeline
                </h3>
                <div className="mt-3">
                  <FreshnessTimeline timeline={report.timeline} observations={selectedObservations} />
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
