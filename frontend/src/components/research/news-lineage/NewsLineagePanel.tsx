"use client";

import { useEffect, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { ArticleEvidence } from "./ArticleEvidence";
import { ClaimTimeline } from "./ClaimTimeline";
import { CorroborationTable } from "./CorroborationTable";
import { StoryClusters } from "./StoryClusters";
import type { LineageReport } from "@/server/research/news-lineage/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: LineageReport }
  | { status: "error"; code: string; message: string };

export type LineageInput = { observedAt: string; articles: unknown[] };

/**
 * Story lineage panel.
 *
 * The wrapper remounts the session component on any account or network change,
 * so nothing derived from a previous wallet survives; the generation guard
 * inside discards a response that resolves after the switch.
 */
export function NewsLineagePanel(props: {
  input?: LineageInput | null;
  account?: string | null;
  network?: string | null;
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <LineageSession
      key={sessionKey}
      sessionKey={sessionKey}
      input={props.input ?? null}
      endpoint={props.endpoint ?? "/api/insights/news-lineage"}
    />
  );
}

function LineageSession({
  sessionKey,
  input,
  endpoint,
}: {
  sessionKey: string;
  input: LineageInput | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
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
            code: typeof payload?.error === "string" ? payload.error : "lineage_analysis_failed",
            message: typeof payload?.message === "string" ? payload.message : "The article evidence could not be analysed.",
          });
          return;
        }

        setState({ status: "ready", report: payload.report });
        setSelectedClusterId(payload.report?.clusters?.[0]?.clusterId ?? null);
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

  const statusMessage =
    state.status === "loading"
      ? "Analysing story lineage."
      : state.status === "error"
        ? `Analysis failed: ${state.message}`
        : report
          ? `Lineage ready. ${report.clusters.length} stor${report.clusters.length === 1 ? "y" : "ies"} across ${report.articles.length} articles. Coverage is ${report.coverage.state}.`
          : "";

  return (
    <div className="space-y-6" data-testid="news-lineage-panel">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No article evidence is loaded. Open this panel from a news agent result to see which reports are independent and
          which are copies of one another.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Analysing story lineage…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">The article evidence could not be analysed.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <section aria-labelledby="lineage-summary-heading" className="rounded-xl border border-white/10 p-4">
            <h2 id="lineage-summary-heading" className="text-sm font-semibold">
              {report.clusters.length} stor{report.clusters.length === 1 ? "y" : "ies"} from {report.articles.length}{" "}
              article{report.articles.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-xs text-subtle">Observed at {report.observedAt}</p>
            <p className="mt-2 text-xs text-subtle">
              Coverage: {report.coverage.state}. {report.coverage.note}
            </p>
            <p className="mt-2 text-xs text-subtle" data-testid="score-unchanged-notice">
              This view adds inspectable lineage over evidence the news agent already produced. It does not change any
              news score, and it is not a confirmation guarantee.
            </p>
          </section>

          <section aria-labelledby="lineage-clusters-heading">
            <h2 id="lineage-clusters-heading" className="text-sm font-semibold">
              Story lineages
            </h2>
            <p className="mt-1 text-xs text-subtle">
              Select a lineage to see each member and the reason it was placed there.
            </p>
            <div className="mt-3">
              <StoryClusters
                clusters={report.clusters}
                corroboration={report.corroboration}
                articles={report.articles}
                selectedClusterId={selectedClusterId}
                onSelect={(clusterId) => setSelectedClusterId(clusterId === selectedClusterId ? null : clusterId)}
              />
            </div>
          </section>

          <section aria-labelledby="lineage-corroboration-heading">
            <h2 id="lineage-corroboration-heading" className="text-sm font-semibold">
              Independent reporting
            </h2>
            <div className="mt-3">
              <CorroborationTable corroboration={report.corroboration} clusters={report.clusters} />
            </div>
          </section>

          <section aria-labelledby="lineage-timeline-heading">
            <h2 id="lineage-timeline-heading" className="text-sm font-semibold">
              Claim chronology
            </h2>
            <div className="mt-3">
              <ClaimTimeline timeline={report.timeline} articles={report.articles} />
            </div>
          </section>

          <section aria-labelledby="lineage-evidence-heading">
            <h2 id="lineage-evidence-heading" className="text-sm font-semibold">
              Article evidence
            </h2>
            <div className="mt-3">
              <ArticleEvidence articles={report.articles} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
