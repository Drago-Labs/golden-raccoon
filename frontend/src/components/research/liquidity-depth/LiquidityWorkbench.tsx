"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { CoverageNotice } from "./CoverageNotice";
import { DepthChart } from "./DepthChart";
import { SizeLadder } from "./SizeLadder";
import { VenueSelector } from "./VenueSelector";
import type { LiquidityReport } from "@/server/research/liquidity-depth/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: LiquidityReport }
  | { status: "error"; code: string; message: string };

export type LiquidityInput = {
  side?: "buy_base" | "sell_base";
  venues: unknown[];
  ladder: string[];
  now?: string;
};

/**
 * Liquidity depth workbench.
 *
 * The wrapper remounts the session component whenever the wallet or network
 * changes, so no analysis derived from a previous session survives; the
 * generation guard inside discards a response that resolves after the switch.
 */
export function LiquidityWorkbench(props: {
  input?: LiquidityInput | null;
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
      endpoint={props.endpoint ?? "/api/insights/liquidity-depth"}
    />
  );
}

function WorkbenchSession({
  sessionKey,
  input,
  endpoint,
}: {
  sessionKey: string;
  input: LiquidityInput | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
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
            code: typeof payload?.error === "string" ? payload.error : "liquidity_analysis_failed",
            message: typeof payload?.message === "string" ? payload.message : "The liquidity snapshot could not be analysed.",
          });
          return;
        }

        setState({ status: "ready", report: payload.report });
        setSelectedVenueId(payload.report?.venues?.[0]?.venue?.venueId ?? null);
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

  const selected = useMemo(() => {
    if (!report) return null;
    return report.venues.find((venue) => venue.venue.venueId === selectedVenueId) ?? report.venues[0] ?? null;
  }, [report, selectedVenueId]);

  const statusMessage =
    state.status === "loading"
      ? "Analysing venue depth."
      : state.status === "error"
        ? `Analysis failed: ${state.message}`
        : report
          ? `Analysis ready for ${report.venues.length} venue${report.venues.length === 1 ? "" : "s"}. Coverage is ${report.coverage.state}.`
          : "";

  return (
    <div className="space-y-6" data-testid="liquidity-workbench">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No venue snapshot is loaded. Open this workbench from the token table to inspect visible depth and price impact
          across trade sizes.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Analysing venue depth…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">The liquidity snapshot could not be analysed.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <section aria-labelledby="liquidity-venues-heading">
            <h2 id="liquidity-venues-heading" className="text-sm font-semibold">
              Venues ({report.venues.length})
            </h2>
            <div className="mt-3">
              <VenueSelector venues={report.venues} selectedVenueId={selected?.venue.venueId ?? null} onSelect={setSelectedVenueId} />
            </div>
          </section>

          {selected ? (
            <>
              <section aria-labelledby="liquidity-snapshot-heading" className="rounded-xl border border-white/10 p-4">
                <h2 id="liquidity-snapshot-heading" className="text-sm font-semibold">
                  {selected.venue.label}
                </h2>
                <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-subtle">Pair</dt>
                    <dd>
                      {selected.venue.base.symbol}/{selected.venue.quote.symbol}
                      <span className="block break-all font-mono text-[11px] text-subtle">
                        {selected.venue.base.identityKey}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Observed</dt>
                    <dd>
                      {selected.venue.observedAt}
                      <span className="block text-subtle">
                        {selected.venue.ledgerOrBlock ? `ledger/block ${selected.venue.ledgerOrBlock}` : "no ledger or block reported"}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Best visible price</dt>
                    <dd className="tabular-nums">{selected.bestPrice ?? "Not derivable"}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Visible depth</dt>
                    <dd className="tabular-nums">
                      {selected.visibleBaseDepth} {selected.venue.base.symbol} base units
                    </dd>
                  </div>
                </dl>
              </section>

              <section aria-labelledby="liquidity-ladder-heading">
                <h2 id="liquidity-ladder-heading" className="text-sm font-semibold">Capacity by trade size</h2>
                <div className="mt-3">
                  <SizeLadder ladder={selected.ladder} base={selected.venue.base} quote={selected.venue.quote} />
                </div>
              </section>

              <section aria-labelledby="liquidity-chart-heading">
                <h2 id="liquidity-chart-heading" className="text-sm font-semibold">Depth curve</h2>
                <p className="mt-1 text-xs text-subtle">
                  Decorative. Every point plotted is a row in the table above.
                </p>
                <div className="mt-3">
                  <DepthChart levels={selected.levels} base={selected.venue.base} />
                </div>
              </section>
            </>
          ) : null}

          <CoverageNotice coverage={report.coverage} venue={selected} />
        </>
      ) : null}
    </div>
  );
}
