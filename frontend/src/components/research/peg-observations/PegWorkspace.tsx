"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { AssetReferenceForm, type DeclarationDraft } from "./AssetReferenceForm";
import { DeviationChart } from "./DeviationChart";
import { EpisodeTable } from "./EpisodeTable";
import { ObservationCoverage } from "./ObservationCoverage";
import type { PegReport } from "@/server/research/peg-observations/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: PegReport }
  | { status: "error"; code: string; message: string };

export type PegInput = {
  windowStart: string;
  windowEnd: string;
  thresholdBps?: number;
  maxGapSeconds?: number;
  staleAfterSeconds?: number;
  rateToleranceSeconds?: number;
  definitions?: unknown[];
  series: unknown[];
  referenceRates?: unknown[];
};

/**
 * Peg deviation workspace.
 *
 * The wrapper remounts the session component on any account or network change,
 * so a report derived from a previous wallet cannot remain on screen; the
 * generation guard inside discards a response that resolves after the switch.
 */
export function PegWorkspace(props: {
  input?: PegInput | null;
  account?: string | null;
  network?: string | null;
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? "anonymous").toLowerCase()}|${props.network ?? "unknown"}`;

  return (
    <PegSession
      key={sessionKey}
      sessionKey={sessionKey}
      initialInput={props.input ?? null}
      endpoint={props.endpoint ?? "/api/insights/peg-observations"}
    />
  );
}

function PegSession({
  sessionKey,
  initialInput,
  endpoint,
}: {
  sessionKey: string;
  initialInput: PegInput | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [input, setInput] = useState<PegInput | null>(initialInput);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
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
            code: typeof payload?.error === "string" ? payload.error : "peg_analysis_failed",
            message: typeof payload?.message === "string" ? payload.message : "The observations could not be analysed.",
          });
          return;
        }

        setState({ status: "ready", report: payload.report });
        setSelectedKey(payload.report?.assets?.[0]?.definition?.asset?.identityKey ?? null);
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
    return report.assets.find((asset) => asset.definition.asset.identityKey === selectedKey) ?? report.assets[0] ?? null;
  }, [report, selectedKey]);

  function declare(draft: DeclarationDraft) {
    if (!input) return;

    setInput({
      ...input,
      definitions: [
        ...(input.definitions ?? []),
        {
          asset: {
            chainId: draft.chainId.trim(),
            symbol: draft.symbol.trim(),
            ...(draft.issuer.trim() ? { issuer: draft.issuer.trim() } : {}),
          },
          referenceCurrency: draft.referenceCurrency.trim(),
          targetValue: draft.targetValue.trim(),
          provenance: draft.provenance,
        },
      ],
    });
  }

  const statusMessage =
    state.status === "loading"
      ? "Analysing peg observations."
      : state.status === "error"
        ? `Analysis failed: ${state.message}`
        : report
          ? `Analysis ready. ${report.coverage.analysedAssetCount} of ${report.coverage.assetCount} assets analysed. Coverage is ${report.coverage.state}.`
          : "";

  return (
    <div className="space-y-6" data-testid="peg-workspace">
      <LiveRegion message={statusMessage} />

      <section aria-labelledby="peg-declaration-heading" className="rounded-xl border border-white/10 p-4">
        <h2 id="peg-declaration-heading" className="text-sm font-semibold">
          Declare a peg
        </h2>
        <div className="mt-3">
          <AssetReferenceForm busy={state.status === "loading"} onDeclare={declare} />
        </div>
      </section>

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No observation series is loaded. Open this workspace from the portfolio card to inspect peg deviations over a
          bounded window.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Analysing peg observations…
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
          {report.assets.length > 1 ? (
            <section aria-labelledby="peg-asset-heading">
              <h2 id="peg-asset-heading" className="text-sm font-semibold">Assets</h2>
              <div role="radiogroup" aria-label="Asset" className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {report.assets.map((asset) => {
                  const active = asset.definition.asset.identityKey === selected?.definition.asset.identityKey;

                  return (
                    <button
                      key={asset.definition.asset.identityKey}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelectedKey(asset.definition.asset.identityKey)}
                      className={`rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] ${
                        active ? "border-[var(--color-brand)]" : "border-white/15 hover:border-white/30"
                      }`}
                    >
                      <span className="block text-sm font-medium">{asset.definition.asset.symbol}</span>
                      <span className="mt-1 block text-xs text-subtle">
                        Target {asset.definition.targetValue} {asset.definition.referenceCurrency}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {selected ? (
            <>
              <section aria-labelledby="peg-definition-heading" className="rounded-xl border border-white/10 p-4">
                <h2 id="peg-definition-heading" className="text-sm font-semibold">
                  {selected.definition.asset.symbol} · target {selected.definition.targetValue}{" "}
                  {selected.definition.referenceCurrency}
                </h2>
                <p className="mt-1 break-all font-mono text-[11px] text-subtle">
                  {selected.definition.asset.identityKey}
                </p>
                <p className="mt-2 text-xs text-subtle">{selected.definition.note}</p>
                <p className="mt-1 text-xs text-subtle">
                  Window {report.windowStart} to {report.windowEnd} · threshold {report.thresholdBps} bps · worst observed{" "}
                  {selected.worstDeviationBps === null ? "not derivable" : `${selected.worstDeviationBps} bps`}
                </p>
              </section>

              <section aria-labelledby="peg-chart-heading">
                <h2 id="peg-chart-heading" className="text-sm font-semibold">Deviation over time</h2>
                <p className="mt-1 text-xs text-subtle">
                  Decorative. Lines break across unobserved intervals; every value appears in the tables below.
                </p>
                <div className="mt-3">
                  <DeviationChart
                    observations={selected.observations}
                    thresholdBps={report.thresholdBps}
                    maxGapSeconds={selected.coverage.longestGapSeconds || 3_600}
                  />
                </div>
              </section>

              <section aria-labelledby="peg-episodes-heading">
                <h2 id="peg-episodes-heading" className="text-sm font-semibold">Threshold episodes</h2>
                <div className="mt-3">
                  <EpisodeTable episodes={selected.episodes} thresholdBps={report.thresholdBps} />
                </div>
              </section>

              <section aria-labelledby="peg-observations-heading">
                <h2 id="peg-observations-heading" className="text-sm font-semibold">Observations</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                    <caption className="py-2 text-left text-xs text-subtle">
                      Every observation in the window, including those that could not be converted.
                    </caption>
                    <thead>
                      <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
                        <th scope="col" className="py-2 pr-3">Observed at</th>
                        <th scope="col" className="py-2 pr-3">Raw price</th>
                        <th scope="col" className="py-2 pr-3">In {selected.definition.referenceCurrency}</th>
                        <th scope="col" className="py-2 pr-3">Deviation</th>
                        <th scope="col" className="py-2 pr-3">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.observations.map((point) => (
                        <tr key={point.observedAt} className="border-b border-white/5 align-top">
                          <th scope="row" className="py-2 pr-3 font-medium">
                            {point.observedAt}
                            {point.stale ? <span className="mt-1 block text-xs font-normal text-[#f2c86d]">stale</span> : null}
                          </th>
                          <td className="py-2 pr-3 text-xs tabular-nums">
                            {point.rawPrice} {point.rawCurrency}
                          </td>
                          <td className="py-2 pr-3 text-xs tabular-nums">
                            {point.referencePrice ?? <span className="text-subtle">Not convertible</span>}
                          </td>
                          <td className="py-2 pr-3 text-xs tabular-nums">
                            {point.deviationBps === null ? (
                              <span className="text-subtle">Not derivable</span>
                            ) : (
                              `${point.deviationBps} bps`
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {point.sourceLabel}
                            {point.unavailableReason ? (
                              <span className="mt-1 block text-subtle">{point.unavailableReason}</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <ObservationCoverage
                coverage={selected.coverage}
                gaps={selected.gaps}
                undefinedAssets={report.undefinedAssets}
              />
            </>
          ) : (
            <ObservationCoverage
              coverage={{
                state: "unavailable",
                observationCount: 0,
                convertedCount: 0,
                unconvertedCount: 0,
                staleCount: 0,
                duplicateTimestampCount: 0,
                gapCount: 0,
                longestGapSeconds: 0,
                observedWindowFraction: null,
                note: report.coverage.note,
              }}
              gaps={[]}
              undefinedAssets={report.undefinedAssets}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
