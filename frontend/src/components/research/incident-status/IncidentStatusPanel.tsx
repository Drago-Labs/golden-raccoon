"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { DisagreementPanel } from "./DisagreementPanel";
import { DocumentTable } from "./DocumentTable";
import { StatusTimeline } from "./StatusTimeline";
import { TransitionList } from "./TransitionList";
import type { IncidentReport } from "@/server/research/incident-status/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: IncidentReport }
  | { status: "error"; code: string; message: string };

export type IncidentInput = {
  observedAt: string;
  staleAfterSeconds?: number;
  subject: unknown;
  documents: unknown[];
};

/**
 * Incident-status evidence explorer.
 *
 * Session is keyed on account and network so nothing from a previous wallet
 * survives a switch; a generation guard discards late responses.
 */
export function IncidentStatusPanel(props: {
  input?: IncidentInput | null;
  account?: string | null;
  network?: string | null;
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <PanelSession
      key={sessionKey}
      sessionKey={sessionKey}
      input={props.input ?? null}
      endpoint={props.endpoint ?? "/api/insights/incident-status"}
    />
  );
}

function PanelSession({
  sessionKey,
  input,
  endpoint,
}: {
  sessionKey: string;
  input: IncidentInput | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
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
            code: typeof payload?.error === "string" ? payload.error : "incident_status_failed",
            message: typeof payload?.message === "string" ? payload.message : "The incident chronology could not be analysed.",
          });
          return;
        }

        setState({ status: "ready", report: payload.report });
        setSelectedDocumentId(payload.report?.documents?.[0]?.documentId ?? null);
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

  const selectedDocument = useMemo(
    () => report?.documents.find((document) => document.documentId === selectedDocumentId) ?? null,
    [report, selectedDocumentId],
  );

  const statusMessage =
    state.status === "loading"
      ? "Analysing incident status evidence."
      : state.status === "error"
        ? `Analysis failed: ${state.message}`
        : report
          ? `Analysis ready. Coverage is ${report.coverage.state}. ${report.coverage.independentOfficialCount} independent official source${report.coverage.independentOfficialCount === 1 ? "" : "s"}.`
          : "";

  return (
    <div className="space-y-6" data-testid="incident-status-panel">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No incident documents are loaded. Open this view with advisory and report evidence for an identified asset or
          protocol to see claimed status transitions without treating rumours as acknowledgements.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Analysing incident status evidence…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">The incident chronology could not be analysed.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <section aria-labelledby="incident-summary-heading" className="rounded-xl border border-white/10 p-4">
            <h2 id="incident-summary-heading" className="text-sm font-semibold">
              {report.subject.displayName}
            </h2>
            <p className="mt-1 text-xs text-subtle">
              {report.subject.chainId} · {report.subject.protocolId}
              {report.subject.contractAddress ? ` · ${report.subject.contractAddress}` : ""}
              {report.subject.issuer ? ` · issuer ${report.subject.issuer}` : ""}
            </p>
            <p className="mt-2 text-xs text-subtle" data-testid="coverage-note">
              Coverage: {report.coverage.state}. {report.coverage.note}
            </p>
            <p className="mt-2 text-xs text-subtle">Observed at {report.observedAt}. News risk scores are unchanged.</p>
          </section>

          <section aria-labelledby="incident-documents-heading">
            <h2 id="incident-documents-heading" className="text-sm font-semibold">
              Documents ({report.documents.length})
            </h2>
            <div className="mt-3">
              <DocumentTable
                documents={report.documents}
                selectedDocumentId={selectedDocumentId}
                onSelect={setSelectedDocumentId}
              />
            </div>
            {selectedDocument ? (
              <p className="mt-3 text-xs text-subtle" data-testid="selected-document-detail">
                Selected: {selectedDocument.title}. {selectedDocument.statusReason}
              </p>
            ) : null}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="incident-timeline-heading">
              <h2 id="incident-timeline-heading" className="text-sm font-semibold">
                Source-linked timeline
              </h2>
              <div className="mt-3">
                <StatusTimeline timeline={report.timeline} />
              </div>
            </section>

            <section aria-labelledby="incident-disagreements-heading">
              <h2 id="incident-disagreements-heading" className="text-sm font-semibold">
                Disagreements
              </h2>
              <div className="mt-3">
                <DisagreementPanel disagreements={report.disagreements} documents={report.documents} />
              </div>
            </section>
          </div>

          <section aria-labelledby="incident-transitions-heading">
            <h2 id="incident-transitions-heading" className="text-sm font-semibold">
              Status transitions
            </h2>
            <div className="mt-3">
              <TransitionList transitions={report.transitions} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
