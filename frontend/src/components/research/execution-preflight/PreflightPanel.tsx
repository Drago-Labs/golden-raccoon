"use client";

import { useEffect, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { BlockerList, PreflightSummary, PreflightTable } from "./PreflightParts";
import type { PreflightReport } from "@/server/research/execution-preflight/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: PreflightReport }
  | { status: "error"; code: string; message: string };

export type PreflightInput = {
  observedAt: string;
  staleAfterSeconds?: number;
  preparedPlan: unknown;
  simulation: unknown;
};

export function PreflightPanel(props: {
  input?: PreflightInput | null;
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
      endpoint={props.endpoint ?? "/api/insights/execution-preflight"}
    />
  );
}

function PanelSession({
  sessionKey,
  input,
  endpoint,
}: {
  sessionKey: string;
  input: PreflightInput | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
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
            code: typeof payload?.error === "string" ? payload.error : "preflight_failed",
            message: typeof payload?.message === "string" ? payload.message : "Preflight failed.",
          });
          return;
        }
        setState({ status: "ready", report: payload.report });
      })
      .catch(() => {
        if (requestGeneration !== generation.current) return;
        setState({ status: "error", code: "network_error", message: "The preflight request could not be completed." });
      });

    return () => {
      generation.current += 1;
    };
  }, [endpoint, input, sessionKey]);

  const report = state.status === "ready" ? state.report : null;
  const statusMessage =
    state.status === "loading"
      ? "Building preflight budget."
      : state.status === "error"
        ? `Preflight failed: ${state.message}`
        : report
          ? `Preflight ready. Coverage ${report.coverage.state}.`
          : "";

  return (
    <div className="space-y-6" data-testid="preflight-panel">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No prepared plan is loaded. Provide an immutable prepared-plan and simulation snapshot to see worst-case spend
          before a wallet prompt.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Building preflight budget…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">Preflight could not be built.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <PreflightSummary report={report} />
          <section aria-labelledby="preflight-table-heading">
            <h2 id="preflight-table-heading" className="text-sm font-semibold">
              Budget table
            </h2>
            <div className="mt-3">
              <PreflightTable rows={report.rows} />
            </div>
          </section>
          <section aria-labelledby="preflight-blockers-heading">
            <h2 id="preflight-blockers-heading" className="text-sm font-semibold">
              Blockers
            </h2>
            <div className="mt-3">
              <BlockerList blockers={report.blockers} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
