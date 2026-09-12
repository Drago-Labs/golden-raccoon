"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { ConcentrationPanel } from "./ConcentrationPanel";
import { CoveragePanel } from "./CoveragePanel";
import { DependencyTable } from "./DependencyTable";
import { ExposureGraph } from "./ExposureGraph";
import type { ExposureMap as Map_ } from "@/server/research/exposure-map/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; map: Map_; unmatchedDeclarations: Array<{ fromAssetKey: string; reason: string }> }
  | { status: "error"; code: string; message: string };

export type ExposureMapInput = {
  walletAddress: string;
  network: string;
  holdings: unknown[];
  relationships?: unknown[];
  observedAt?: string;
};

/**
 * Shared-exposure workbench.
 *
 * Given a wallet address it loads that wallet's current holdings and analyses
 * them; given an explicit `input` it analyses that instead, which is how tests
 * and the journey drive it without a portfolio provider.
 *
 * Relationship declarations are never discovered: this feature does not infer
 * provenance, so a wallet with no declarations produces a map that says so.
 *
 * The wrapper remounts the session component on any account or network change,
 * so nothing derived from a previous wallet can stay on screen; the generation
 * guard inside discards a response that resolves after the switch.
 */
export function ExposureMap(props: {
  input?: ExposureMapInput | null;
  walletAddress?: string | null;
  network?: string | null;
  endpoint?: string;
  portfolioEndpoint?: string;
}) {
  const wallet = props.input?.walletAddress ?? props.walletAddress ?? null;
  const network = props.input?.network ?? props.network ?? null;
  const sessionKey = `${(wallet ?? "anonymous").toLowerCase()}|${network ?? "unknown"}`;

  return (
    <ExposureSession
      key={sessionKey}
      sessionKey={sessionKey}
      input={props.input ?? null}
      walletAddress={wallet}
      network={network}
      endpoint={props.endpoint ?? "/api/insights/exposure-map"}
      portfolioEndpoint={props.portfolioEndpoint ?? "/api/portfolio"}
    />
  );
}

function ExposureSession({
  sessionKey,
  input,
  walletAddress,
  network,
  endpoint,
  portfolioEndpoint,
}: {
  sessionKey: string;
  input: ExposureMapInput | null;
  walletAddress: string | null;
  network: string | null;
  endpoint: string;
  portfolioEndpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [view, setView] = useState<"table" | "graph">("table");
  const generation = useRef(0);

  useEffect(() => {
    if (!input && !walletAddress) return;

    generation.current += 1;
    const requestGeneration = generation.current;

    Promise.resolve()
      .then(async () => {
        if (requestGeneration !== generation.current) return null;
        setState({ status: "loading" });

        let payload = input;

        if (!payload && walletAddress) {
          const chain = network ?? "stellar-pubnet";
          const query = new URLSearchParams({ walletAddress, chain });
          const portfolio = await fetch(`${portfolioEndpoint}?${query.toString()}`, { cache: "no-store" });

          if (requestGeneration !== generation.current) return null;

          if (!portfolio.ok) {
            setState({ status: "error", code: "portfolio_unavailable", message: "The portfolio could not be loaded for this wallet." });
            return null;
          }

          const snapshot = await portfolio.json();

          if (requestGeneration !== generation.current) return null;

          payload = {
            walletAddress,
            network: chain,
            holdings: Array.isArray(snapshot?.holdings) ? snapshot.holdings : [],
            relationships: [],
            observedAt: typeof snapshot?.createdAt === "string" ? snapshot.createdAt : undefined,
          };
        }

        if (!payload) return null;

        return fetch(endpoint, {
          method: "POST",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      })
      .then(async (response) => {
        if (!response || requestGeneration !== generation.current) return;

        const payload = await response.json();

        if (requestGeneration !== generation.current) return;

        if (!response.ok) {
          setState({
            status: "error",
            code: typeof payload?.error === "string" ? payload.error : "exposure_map_failed",
            message: typeof payload?.message === "string" ? payload.message : "The exposure map could not be built.",
          });
          return;
        }

        setState({ status: "ready", map: payload.map, unmatchedDeclarations: payload.unmatchedDeclarations ?? [] });
      })
      .catch(() => {
        if (requestGeneration !== generation.current) return;
        setState({ status: "error", code: "network_error", message: "The analysis request could not be completed." });
      });

    return () => {
      generation.current += 1;
    };
  }, [endpoint, input, network, portfolioEndpoint, sessionKey, walletAddress]);

  const map = state.status === "ready" ? state.map : null;

  const labelFor = useMemo(() => {
    const index = new Map((map?.nodes ?? []).map((node) => [node.id, node]));
    return (nodeId: string) => {
      const node = index.get(nodeId);
      return node ? { label: node.label, totalMicroUsd: node.totalMicroUsd } : null;
    };
  }, [map]);

  const statusMessage =
    state.status === "loading"
      ? "Building the exposure map."
      : state.status === "error"
        ? `Exposure map failed: ${state.message}`
        : map
          ? `Exposure map ready. ${map.groups.length} shared dependencies across ${map.coverage.holdingCount} holdings. Coverage is ${map.coverage.state}.`
          : "";

  return (
    <div className="space-y-6" data-testid="exposure-map">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No wallet is selected. Open this map from the wallet portfolio card to see which holdings share an issuer,
          protocol or underlying asset.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Building the exposure map…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">The exposure map could not be built.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {map ? (
        <>
          <section aria-labelledby="exposure-subject-heading" className="rounded-xl border border-white/10 p-4">
            <h2 id="exposure-subject-heading" className="text-sm font-semibold">
              {map.groups.length} shared {map.groups.length === 1 ? "dependency" : "dependencies"} on {map.network}
            </h2>
            <p className="mt-1 break-all font-mono text-[11px] text-subtle">{map.walletAddress}</p>
            <p className="mt-1 text-xs text-subtle">Observed at {map.observedAt}</p>
          </section>

          <section aria-labelledby="exposure-groups-heading">
            <h2 id="exposure-groups-heading" className="text-sm font-semibold">Grouped exposure</h2>
            <div className="mt-3">
              <ConcentrationPanel groups={map.groups} />
            </div>
          </section>

          <section aria-labelledby="exposure-dependencies-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="exposure-dependencies-heading" className="text-sm font-semibold">Dependencies</h2>
              <div role="group" aria-label="Dependency view" className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setView("table")}
                  aria-pressed={view === "table"}
                  className={`rounded-full border px-3 py-1.5 text-xs ${view === "table" ? "border-[var(--color-brand)]" : "border-white/15 text-subtle"}`}
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setView("graph")}
                  aria-pressed={view === "graph"}
                  className={`rounded-full border px-3 py-1.5 text-xs ${view === "graph" ? "border-[var(--color-brand)]" : "border-white/15 text-subtle"}`}
                >
                  Diagram
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-subtle">
              The table is the canonical view. The diagram is decorative and carries no information the table omits.
            </p>
            <div className="mt-3">
              {view === "table" ? (
                <DependencyTable edges={map.edges} labelFor={labelFor} />
              ) : (
                <ExposureGraph nodes={map.nodes} edges={map.edges} />
              )}
            </div>
          </section>

          <CoveragePanel
            coverage={map.coverage}
            unresolved={map.unresolved}
            unmatchedDeclarations={state.status === "ready" ? state.unmatchedDeclarations : []}
          />
        </>
      ) : null}
    </div>
  );
}
