"use client";

import { useEffect, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import { ActivityTimeline } from "./ActivityTimeline";
import { MessageClusters } from "./MessageClusters";
import { ParticipationTable } from "./ParticipationTable";
import { SamplingNotice } from "./SamplingNotice";
import type { CoordinationReport } from "@/server/research/social-coordination/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: CoordinationReport }
  | { status: "error"; code: string; message: string };

export type CoordinationInput = {
  observedAt: string;
  sampleIsExhaustive?: boolean;
  observations: unknown[];
};

/**
 * Coordinated-activity pattern workbench.
 *
 * The wrapper remounts the session component on any account or network change.
 * Uploaded observations live only in this component's state, so the remount is
 * also what clears them: nothing is persisted anywhere.
 */
export function SocialPatternWorkbench(props: {
  input?: CoordinationInput | null;
  account?: string | null;
  network?: string | null;
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <WorkbenchSession
      key={sessionKey}
      sessionKey={sessionKey}
      input={props.input ?? null}
      endpoint={props.endpoint ?? "/api/insights/social-coordination"}
    />
  );
}

function WorkbenchSession({
  sessionKey,
  input,
  endpoint,
}: {
  sessionKey: string;
  input: CoordinationInput | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);
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
            code: typeof payload?.error === "string" ? payload.error : "coordination_analysis_failed",
            message: typeof payload?.message === "string" ? payload.message : "The observations could not be analysed.",
          });
          return;
        }

        setState({ status: "ready", report: payload.report });
      })
      .catch(() => {
        if (requestGeneration !== generation.current) return;
        setState({ status: "error", code: "network_error", message: "The analysis request could not be completed." });
      });

    return () => {
      // Voids the in-flight request and drops the uploaded observations with it.
      generation.current += 1;
    };
  }, [endpoint, input, sessionKey]);

  const report = state.status === "ready" ? state.report : null;

  const statusMessage =
    state.status === "loading"
      ? "Analysing observation patterns."
      : state.status === "error"
        ? `Analysis failed: ${state.message}`
        : report
          ? `Analysis ready. ${report.findings.length} finding${report.findings.length === 1 ? "" : "s"} from ${report.sampling.analysedCount} analysable observations. Coverage is ${report.coverage.state}.`
          : "";

  return (
    <div className="space-y-6" data-testid="social-pattern-workbench">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No observations are loaded. Open this workbench from a social agent result to inspect whether a spike consists
          of repeated messages from a small group.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Analysing observation patterns…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">The observations could not be analysed.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <SamplingNotice sampling={report.sampling} coverage={report.coverage} />

          <p className="rounded-xl border border-white/10 px-4 py-3 text-xs text-subtle" data-testid="measurement-notice">
            Everything below is a measurement of the supplied observations. It does not establish automation, a shared
            operator, or intent, and no account is described as a bot. The social score and recommendation are unchanged.
          </p>

          <section aria-labelledby="coordination-findings-heading">
            <h2 id="coordination-findings-heading" className="text-sm font-semibold">
              Findings ({report.findings.length})
            </h2>
            {report.findings.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
                No measurement crossed a published threshold. That is not evidence that nothing happened outside this
                sample.
              </p>
            ) : (
              <ul className="mt-3 space-y-3" data-testid="findings">
                {report.findings.map((finding) => (
                  <li key={finding.findingId} className="rounded-xl border border-white/10 p-4 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={finding.strength === "measured" ? "warning" : "neutral"}>
                        {finding.strength === "measured" ? "Measured" : "Insufficient evidence"}
                      </StatusBadge>
                      <span className="text-xs uppercase tracking-wide text-subtle">
                        {finding.kind.replace(/_/g, " ")}
                      </span>
                    </span>
                    <p className="mt-2">{finding.measurement}</p>
                    <p className="mt-2 text-xs text-subtle">
                      <span className="font-medium">Threshold:</span> {finding.threshold}
                    </p>
                    <p className="mt-1 text-xs text-subtle">
                      <span className="font-medium">This does not establish:</span> {finding.limitation}
                    </p>
                    {finding.supportingObservationIds.length > 0 ? (
                      <p className="mt-1 text-xs text-subtle">
                        {finding.supportingObservationIds.length} supporting observation
                        {finding.supportingObservationIds.length === 1 ? "" : "s"}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="coordination-clusters-heading">
            <h2 id="coordination-clusters-heading" className="text-sm font-semibold">
              Repeated messages
            </h2>
            <div className="mt-3">
              <MessageClusters
                clusters={report.clusters}
                observations={report.observations}
                expandedClusterId={expandedClusterId}
                onToggle={(clusterId) => setExpandedClusterId(clusterId === expandedClusterId ? null : clusterId)}
              />
            </div>
          </section>

          <section aria-labelledby="coordination-timeline-heading">
            <h2 id="coordination-timeline-heading" className="text-sm font-semibold">
              Activity over time
            </h2>
            <div className="mt-3">
              <ActivityTimeline buckets={report.timeline} bucketSeconds={report.thresholds.burstBucketSeconds} />
            </div>
          </section>

          <section aria-labelledby="coordination-participation-heading">
            <h2 id="coordination-participation-heading" className="text-sm font-semibold">
              Participation
            </h2>
            <div className="mt-3">
              <ParticipationTable participation={report.participation} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
