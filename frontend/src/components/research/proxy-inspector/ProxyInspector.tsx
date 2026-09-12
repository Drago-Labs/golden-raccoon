"use client";

import { useCallback, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import { AuthorityTable } from "./AuthorityTable";
import { ContractInput } from "./ContractInput";
import { ImplementationGraph } from "./ImplementationGraph";
import { ProxyEvidence } from "./ProxyEvidence";
import type { ProxyClassification, ProxyInspectionReport } from "@/server/research/proxy-inspector/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: ProxyInspectionReport }
  | { status: "error"; code: string; message: string };

const CLASSIFICATION_LABELS: Record<ProxyClassification, string> = {
  not_a_contract: "No contract",
  no_proxy_indirection_observed: "No indirection observed",
  erc1967_direct_proxy: "ERC-1967 proxy",
  erc1967_beacon_proxy: "Beacon proxy",
  legacy_slot_proxy: "Legacy slot proxy",
  conflicting_slots: "Conflicting slots",
  cyclic_indirection: "Cyclic indirection",
  unsupported_proxy_pattern: "Unsupported pattern",
  unavailable: "Unavailable",
};

function classificationTone(classification: ProxyClassification): "success" | "warning" | "danger" | "neutral" {
  if (classification === "conflicting_slots" || classification === "cyclic_indirection") return "danger";
  if (classification === "erc1967_direct_proxy" || classification === "erc1967_beacon_proxy" || classification === "legacy_slot_proxy") {
    return "warning";
  }
  if (classification === "unavailable" || classification === "unsupported_proxy_pattern") return "neutral";
  return "success";
}

/**
 * Implementation and upgrade authority workspace.
 *
 * The session is keyed by account and network, so switching either remounts
 * this component and discards the previous report. Combined with the
 * generation guard below, a slow response for Ethereum cannot paint itself
 * into a view the user has already moved to Base.
 */
export function ProxyInspector(props: {
  account?: string | null;
  network?: string | null;
  address?: string | null;
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <InspectorSession
      key={sessionKey}
      defaultNetwork={props.network ?? "ethereum"}
      defaultAddress={props.address ?? ""}
      endpoint={props.endpoint ?? "/api/insights/proxy-inspector"}
    />
  );
}

function InspectorSession({
  defaultNetwork,
  defaultAddress,
  endpoint,
}: {
  defaultNetwork: string;
  defaultAddress: string;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const generation = useRef(0);

  const inspect = useCallback(
    (request: { network: string; address: string }) => {
      generation.current += 1;
      const requestGeneration = generation.current;

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      })
        .then(async (response) => {
          const payload = await response.json();

          // A response that arrives after a newer request is dropped, so a
          // stale network's result can never repaint the current one.
          if (requestGeneration !== generation.current) return;

          if (!response.ok) {
            setState({
              status: "error",
              code: typeof payload?.error === "string" ? payload.error : "proxy_inspection_failed",
              message: typeof payload?.message === "string" ? payload.message : "The contract could not be inspected.",
            });
            return;
          }

          setState({ status: "ready", report: payload.report });
        })
        .catch(() => {
          if (requestGeneration !== generation.current) return;
          setState({ status: "error", code: "network_error", message: "The inspection request could not be completed." });
        });
    },
    [endpoint],
  );

  const report = state.status === "ready" ? state.report : null;

  const statusMessage =
    state.status === "loading"
      ? "Reading contract code and standardized storage slots."
      : state.status === "error"
        ? `Inspection failed: ${state.message}`
        : report
          ? `Inspection ready. ${CLASSIFICATION_LABELS[report.classification]}. Coverage is ${report.coverage.state}.`
          : "";

  return (
    <div className="flex flex-col gap-6">
      <ContractInput
        defaultNetwork={defaultNetwork}
        defaultAddress={defaultAddress}
        busy={state.status === "loading"}
        onSubmit={inspect}
      />

      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p data-testid="inspector-idle" className="text-sm text-white/54">
          Enter a contract address to read its implementation slots. Nothing is submitted on-chain and no signature is requested.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p data-testid="inspector-loading" className="text-sm text-white/54">
          Reading…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div data-testid="inspector-error" role="alert" className="glass-panel rounded-[28px] p-5 text-sm text-red-200">
          <p className="font-semibold">The contract could not be inspected.</p>
          <p className="mt-1 text-white/70">{state.message}</p>
          <p className="mt-2 text-xs text-white/42">Error code: {state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <section data-testid="inspector-summary" aria-labelledby="proxy-summary-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="proxy-summary-heading" className="text-xl font-semibold">
                {CLASSIFICATION_LABELS[report.classification]}
              </h2>
              <StatusBadge tone={classificationTone(report.classification)}>{report.coverage.state} coverage</StatusBadge>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/70">{report.summary}</p>
            <p className="mt-2 break-all font-mono text-xs text-white/42">
              {report.target.address} · {report.target.network}
              {report.target.chainId === null ? "" : ` · chain ${report.target.chainId}`}
            </p>
            <p className="mt-2 text-xs text-white/42">{report.coverage.note}</p>
          </section>

          <section aria-labelledby="proxy-path-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="proxy-path-heading" className="text-lg font-semibold">
              Implementation path
            </h2>
            <div className="mt-4">
              <ImplementationGraph path={report.path} />
            </div>
          </section>

          <section aria-labelledby="proxy-authority-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="proxy-authority-heading" className="text-lg font-semibold">
              Observed authority
            </h2>
            <p className="mt-1 text-xs leading-5 text-white/42">
              Observed authority is not the same as control. Every row states what it does not establish.
            </p>
            <div className="mt-4">
              <AuthorityTable authority={report.authority} />
            </div>
          </section>

          {report.findings.length > 0 ? (
            <section data-testid="proxy-findings" aria-labelledby="proxy-findings-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
              <h2 id="proxy-findings-heading" className="text-lg font-semibold">
                Findings
              </h2>
              <ul className="mt-4 flex flex-col gap-4">
                {report.findings.map((finding) => (
                  <li key={finding.findingId} className="rounded-2xl border border-white/10 bg-white/4 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={finding.severity === "attention" ? "warning" : "neutral"}>{finding.severity}</StatusBadge>
                      <p className="text-sm font-medium text-white/80">{finding.statement}</p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/54">{finding.evidence}</p>
                    <p className="mt-1 text-xs leading-5 text-white/42">{finding.limitation}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="proxy-evidence-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
            <h2 id="proxy-evidence-heading" className="text-lg font-semibold">
              Evidence
            </h2>
            <p className="mt-1 text-xs leading-5 text-white/42">
              The reads behind every statement above, so they can be repeated rather than trusted.
            </p>
            <div className="mt-4">
              <ProxyEvidence report={report} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
