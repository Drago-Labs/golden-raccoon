"use client";

import { useEffect, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import { ContinuityTimeline } from "./ContinuityTimeline";
import { CrossLinkTable } from "./CrossLinkTable";
import { SourceCoveragePanel } from "./SourceCoveragePanel";
import type { ContinuityReport } from "@/server/research/channel-continuity/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: ContinuityReport }
  | { status: "error"; code: string; message: string };

export type ContinuityInput = {
  observedAt: string;
  subjects: unknown[];
  observations: unknown[];
};

/**
 * Read-only channel continuity inspector.
 *
 * Uploaded observations live only in this component's state. The wrapper
 * remounts on account or network change so nothing persists across sessions.
 */
export function ChannelContinuityInspector(props: {
  input?: ContinuityInput | null;
  account?: string | null;
  network?: string | null;
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <InspectorSession
      key={sessionKey}
      sessionKey={sessionKey}
      input={props.input ?? null}
      endpoint={props.endpoint ?? "/api/insights/channel-continuity"}
    />
  );
}

function InspectorSession({
  sessionKey,
  input,
  endpoint,
}: {
  sessionKey: string;
  input: ContinuityInput | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
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
            code: typeof payload?.error === "string" ? payload.error : "continuity_analysis_failed",
            message:
              typeof payload?.message === "string"
                ? payload.message
                : "The channel observations could not be inspected.",
          });
          return;
        }

        setState({ status: "ready", report: payload.report });
      })
      .catch(() => {
        if (requestGeneration !== generation.current) return;
        setState({ status: "error", code: "network_error", message: "The continuity request could not be completed." });
      });

    return () => {
      generation.current += 1;
    };
  }, [endpoint, input, sessionKey]);

  const report = state.status === "ready" ? state.report : null;

  const statusMessage =
    state.status === "loading"
      ? "Inspecting channel continuity."
      : state.status === "error"
        ? `Inspection failed: ${state.message}`
        : report
          ? `Continuity ready. ${report.events.length} event${report.events.length === 1 ? "" : "s"} from ${report.coverage.analysableCount} analysable observations. Coverage is ${report.coverage.state}.`
          : "";

  return (
    <div className="space-y-6" data-testid="channel-continuity-inspector">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No channel observations are loaded. Open this inspector from a social agent result, or POST bounded
          observations of project-declared websites and social handles to compare continuity over time.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Inspecting channel continuity…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">The channel observations could not be inspected.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <SourceCoveragePanel rows={report.sourceCoverage} coverage={report.coverage} />

          <p className="rounded-xl border border-white/10 px-4 py-3 text-xs text-subtle" data-testid="evidence-notice">
            Everything below is observed evidence from the supplied channel snapshots. A link or handle change is not
            proof of takeover or fraud. Channels are never called official solely because they use a project ticker or
            visual branding. Ambiguous and user-supplied claims stay labelled. The social score is unchanged.
          </p>

          <section aria-labelledby="continuity-findings-heading">
            <h2 id="continuity-findings-heading" className="text-sm font-semibold">
              Findings ({report.findings.length})
            </h2>
            {report.findings.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
                No continuity events were derived. That is not evidence that channels were stable outside this sample.
              </p>
            ) : (
              <ul className="mt-3 space-y-3" data-testid="continuity-findings">
                {report.findings.map((finding) => (
                  <li key={finding.findingId} className="rounded-xl border border-white/10 p-4 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={finding.strength === "observed" ? "warning" : "neutral"}>
                        {finding.strength === "observed" ? "Observed evidence" : "Insufficient evidence"}
                      </StatusBadge>
                      <span className="text-xs uppercase tracking-wide text-subtle">
                        {finding.kind.replace(/_/g, " ")}
                      </span>
                    </span>
                    <p className="mt-2">{finding.measurement}</p>
                    <p className="mt-1 text-xs text-subtle">
                      <span className="font-medium">This does not establish:</span> {finding.limitation}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="continuity-timeline-heading">
            <h2 id="continuity-timeline-heading" className="text-sm font-semibold">
              Continuity timeline
            </h2>
            <div className="mt-3">
              <ContinuityTimeline events={report.events} />
            </div>
            {report.events.length > 0 ? (
              <div className="mt-3">
                <label className="block text-xs text-subtle" htmlFor="event-focus">
                  Focus an event (keyboard accessible)
                </label>
                <select
                  id="event-focus"
                  className="mt-1 h-10 w-full max-w-xl rounded-xl border border-white/10 bg-black/25 px-3 text-sm"
                  value={selectedEventId ?? ""}
                  onChange={(event) => setSelectedEventId(event.target.value || null)}
                >
                  <option value="">No event focused</option>
                  {report.events.map((event) => (
                    <option key={event.eventId} value={event.eventId}>
                      {(event.observedAt ?? "undated") + " · " + event.kind.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                {selectedEventId ? (
                  <p className="mt-2 text-xs text-subtle" data-testid="focused-event">
                    Focused: {report.events.find((event) => event.eventId === selectedEventId)?.detail}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section aria-labelledby="continuity-crosslinks-heading">
            <h2 id="continuity-crosslinks-heading" className="text-sm font-semibold">
              Cross-link graph
            </h2>
            <div className="mt-3">
              <CrossLinkTable edges={report.crossLinks} />
            </div>
          </section>

          <section aria-labelledby="continuity-subjects-heading">
            <h2 id="continuity-subjects-heading" className="text-sm font-semibold">
              Subjects kept separate
            </h2>
            <div className="mt-3 overflow-x-auto" data-testid="subject-table">
              <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                <caption className="py-2 text-left text-xs text-subtle">
                  Same-symbol tokens stay on distinct identity keys. Lookalike domains never merge subjects.
                </caption>
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
                    <th scope="col" className="py-2 pr-3">Subject</th>
                    <th scope="col" className="py-2 pr-3">Identity key</th>
                    <th scope="col" className="py-2 pr-3">Chain</th>
                    <th scope="col" className="py-2 pr-3">Symbol</th>
                  </tr>
                </thead>
                <tbody>
                  {report.subjects.map((subject) => (
                    <tr key={subject.subjectId} className="border-b border-white/5">
                      <th scope="row" className="py-2 pr-3 text-xs font-medium">
                        {subject.subjectId}
                      </th>
                      <td className="py-2 pr-3 font-mono text-xs">{subject.identityKey}</td>
                      <td className="py-2 pr-3 text-xs">{subject.chainId}</td>
                      <td className="py-2 pr-3 text-xs">{subject.symbol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
