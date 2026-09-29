"use client";

import { useCallback, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { MetadataIntegrityReport, MetadataObservation } from "@/server/research/metadata-integrity/schema";
import { AssetLookupForm, type AssetLookupSubmission } from "./AssetLookupForm";
import { DeclarationStatusPanel } from "./DeclarationStatus";
import { DiffTable } from "./DiffTable";
import { ObservationTimeline } from "./ObservationTimeline";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: MetadataIntegrityReport }
  | { status: "error"; code: string; message: string };

const COVERAGE_TONES: Record<MetadataIntegrityReport["coverage"]["state"], "success" | "warning" | "danger" | "neutral"> = {
  complete: "success",
  partial: "warning",
  empty: "neutral",
  unavailable: "danger",
};

/**
 * Read-only metadata integrity workspace.
 *
 * Prior observations stay in session state so a second inspect can surface
 * drift without claiming the change is fraud. Nothing is written server-side.
 */
export function MetadataIntegrityWorkspace(props: {
  assetCode?: string | null;
  issuer?: string | null;
  network?: "testnet" | "pubnet" | null;
  endpoint?: string;
}) {
  const sessionKey = `${props.network ?? "pubnet"}|${(props.assetCode ?? "").toUpperCase()}|${(props.issuer ?? "").toUpperCase()}`;

  return (
    <WorkspaceSession
      key={sessionKey}
      defaults={{
        assetCode: props.assetCode ?? "",
        issuer: props.issuer ?? "",
        network: props.network ?? "pubnet",
        homeDomain: "",
      }}
      endpoint={props.endpoint ?? "/api/insights/metadata-integrity"}
    />
  );
}

function WorkspaceSession({
  defaults,
  endpoint,
}: {
  defaults: AssetLookupSubmission;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [history, setHistory] = useState<MetadataObservation[]>([]);
  const generation = useRef(0);

  const inspect = useCallback(
    (submission: AssetLookupSubmission) => {
      generation.current += 1;
      const requestGeneration = generation.current;

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetCode: submission.assetCode,
          issuer: submission.issuer,
          network: submission.network,
          ...(submission.homeDomain ? { homeDomain: submission.homeDomain } : {}),
          priorObservations: history,
          evaluatedAt: new Date().toISOString(),
        }),
      })
        .then(async (response) => {
          const body = await response.json();

          if (requestGeneration !== generation.current) return;

          if (!response.ok) {
            setState({
              status: "error",
              code: typeof body?.error === "string" ? body.error : "metadata_integrity_failed",
              message:
                typeof body?.message === "string"
                  ? body.message
                  : "The metadata integrity inspection could not be completed.",
            });
            return;
          }

          const report = body.report as MetadataIntegrityReport;
          setHistory(report.timeline);
          setState({ status: "ready", report });
        })
        .catch(() => {
          if (requestGeneration !== generation.current) return;
          setState({
            status: "error",
            code: "network_error",
            message: "The inspection request could not be completed.",
          });
        });
    },
    [endpoint, history],
  );

  const liveMessage =
    state.status === "loading"
      ? "Inspecting issuer home domain and stellar.toml"
      : state.status === "ready"
        ? `Inspection ready: ${state.report.declarationStatus}`
        : state.status === "error"
          ? state.message
          : null;

  return (
    <div className="flex flex-col gap-8">
      <LiveRegion message={liveMessage} politeness={state.status === "error" ? "assertive" : "polite"} />

      <AssetLookupForm defaults={defaults} busy={state.status === "loading"} onSubmit={inspect} />

      {state.status === "idle" ? (
        <p className="text-sm text-muted" data-testid="metadata-idle">
          Enter an asset code and issuer to compare the ledger home domain against SEP-1 declarations. A matching TOML
          entry is an observation, not proof of domain ownership, and a metadata change is never labelled fraud here.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p className="text-sm text-muted" data-testid="metadata-loading" role="status">
          Fetching issuer account and stellar.toml with bounded HTTPS guards…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div className="rounded-xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm" data-testid="metadata-error" role="alert">
          <p className="font-semibold">{state.code}</p>
          <p className="text-red-100/90">{state.message}</p>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <div className="flex flex-col gap-8" data-testid="metadata-report">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={COVERAGE_TONES[state.report.coverage.state]}>{state.report.coverage.state}</StatusBadge>
            <p className="text-sm text-muted">{state.report.coverage.note}</p>
          </div>

          <DeclarationStatusPanel
            declarationStatus={state.report.declarationStatus}
            fetchOutcome={state.report.tomlFetch.outcome}
            identityKey={state.report.identityKey}
            notes={state.report.currentObservation.notes}
            domainOwnershipClaimed={state.report.domainOwnershipClaimed}
            changeIsObservationNotFraud={state.report.changeIsObservationNotFraud}
            legitimacyVerdict={state.report.legitimacyVerdict}
          />

          <section aria-labelledby="fetch-heading" data-testid="toml-fetch-evidence">
            <h2 id="fetch-heading" className="text-lg font-semibold">
              TOML fetch evidence
            </h2>
            <dl className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-2">
              <div>
                <dt className="inline text-subtle">Requested: </dt>
                <dd className="inline break-all">{state.report.tomlFetch.requestedUrl ?? "—"}</dd>
              </div>
              <div>
                <dt className="inline text-subtle">Final: </dt>
                <dd className="inline break-all">{state.report.tomlFetch.finalUrl ?? "—"}</dd>
              </div>
              <div>
                <dt className="inline text-subtle">Redirects: </dt>
                <dd className="inline">{state.report.tomlFetch.redirectCount}</dd>
              </div>
              <div>
                <dt className="inline text-subtle">Bytes: </dt>
                <dd className="inline">{state.report.tomlFetch.byteLength ?? "—"}</dd>
              </div>
            </dl>
          </section>

          <ObservationTimeline timeline={state.report.timeline} />
          <DiffTable diffs={state.report.diffs} />
        </div>
      ) : null}
    </div>
  );
}
