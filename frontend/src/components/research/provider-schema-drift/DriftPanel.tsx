"use client";

import { useEffect, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { DriftReport } from "@/server/research/provider-schema-drift/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: DriftReport }
  | { status: "error"; code: string; message: string };

export type DriftInput = {
  observedAt: string;
  mode?: "replay" | "live";
  probes: unknown[];
};

const toneFor = (classification: string): "success" | "warning" | "danger" | "neutral" => {
  if (classification === "breaking" || classification === "unavailable") return "danger";
  if (classification === "additive" || classification === "inconclusive") return "warning";
  if (classification === "unchanged") return "success";
  return "neutral";
};

export function DriftPanel(props: {
  input?: DriftInput | null;
  operatorToken?: string | null;
  endpoint?: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const generation = useRef(0);

  useEffect(() => {
    if (!props.input) return;
    generation.current += 1;
    const requestGeneration = generation.current;

    Promise.resolve()
      .then(() => {
        if (requestGeneration !== generation.current) return null;
        setState({ status: "loading" });
        const headers: Record<string, string> = { "content-type": "application/json", "x-operator-test": "1" };
        if (props.operatorToken) headers["x-operator-token"] = props.operatorToken;
        return fetch(props.endpoint ?? "/api/ops/provider-schema-drift", {
          method: "POST",
          cache: "no-store",
          headers,
          body: JSON.stringify(props.input),
        });
      })
      .then(async (response) => {
        if (!response || requestGeneration !== generation.current) return;
        const payload = await response.json();
        if (requestGeneration !== generation.current) return;
        if (!response.ok) {
          setState({
            status: "error",
            code: typeof payload?.error === "string" ? payload.error : "drift_analysis_failed",
            message: typeof payload?.message === "string" ? payload.message : "Drift analysis failed.",
          });
          return;
        }
        setState({ status: "ready", report: payload.report });
      })
      .catch(() => {
        if (requestGeneration !== generation.current) return;
        setState({ status: "error", code: "network_error", message: "The drift request could not be completed." });
      });

    return () => {
      generation.current += 1;
    };
  }, [props.endpoint, props.input, props.operatorToken]);

  const report = state.status === "ready" ? state.report : null;
  const statusMessage =
    state.status === "loading"
      ? "Running provider contract probes."
      : state.status === "error"
        ? `Probe failed: ${state.message}`
        : report
          ? `Probe ready. Breaking ${report.summary.breaking}, unavailable ${report.summary.unavailable}.`
          : "";

  return (
    <div className="space-y-6" data-testid="drift-panel">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          Operator-only workspace. Replay stored fixtures or opt into bounded live probes against configured test
          endpoints. Credentials and wallet identifiers are redacted from artifacts.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Running probes…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">Drift analysis failed.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <section aria-labelledby="drift-summary-heading" className="rounded-xl border border-white/10 p-4">
            <h2 id="drift-summary-heading" className="text-sm font-semibold">
              Provider schema drift · {report.mode}
            </h2>
            <p className="mt-2 text-xs text-subtle" data-testid="drift-summary">
              {report.summary.note}
            </p>
            <p className="mt-2 text-xs text-subtle">
              Breaking {report.summary.breaking} · additive {report.summary.additive} · unavailable{" "}
              {report.summary.unavailable} · inconclusive {report.summary.inconclusive} · unchanged{" "}
              {report.summary.unchanged}
            </p>
          </section>

          <section aria-labelledby="drift-findings-heading">
            <h2 id="drift-findings-heading" className="text-sm font-semibold">
              Findings
            </h2>
            <ul className="mt-3 space-y-2" data-testid="drift-findings">
              {report.findings.map((finding, index) => (
                <li key={`${finding.provider}-${finding.classification}-${index}`} className="rounded-xl border border-white/10 px-4 py-3">
                  <StatusBadge tone={toneFor(finding.classification)}>
                    {finding.provider} · {finding.classification}
                  </StatusBadge>
                  <p className="mt-2 text-xs text-subtle">{finding.detail}</p>
                  {finding.path ? <p className="mt-1 font-mono text-[11px] text-subtle">{finding.path}</p> : null}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="drift-artifacts-heading">
            <h2 id="drift-artifacts-heading" className="text-sm font-semibold">
              Redacted artifacts
            </h2>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 p-3 text-[11px] text-subtle" data-testid="drift-artifacts">
              {JSON.stringify(report.artifacts, null, 2)}
            </pre>
          </section>
        </>
      ) : null}
    </div>
  );
}
