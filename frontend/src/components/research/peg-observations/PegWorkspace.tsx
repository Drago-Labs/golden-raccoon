"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  type PegAnalysisResult,
} from "@/server/research/peg-observations";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import {
  AssetReferenceForm,
  type AssetReferenceFormValues,
} from "./AssetReferenceForm";
import { ObservationCoverage } from "./ObservationCoverage";
import { DeviationChart } from "./DeviationChart";
import { EpisodeTable } from "./EpisodeTable";

interface PegWorkspaceProps {
  initialFixture?: string;
  connectedWallet?: string | null;
  connectedNetwork?: string | null;
}

const DEFAULT_FORM_VALUES: AssetReferenceFormValues = {
  assetId: {
    chainFamily: "evm",
    network: "ethereum",
    symbol: "USDC",
    addressOrIssuer: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  },
  thresholdBps: 50,
  gapToleranceMinutes: 60,
};

/**
 * Main interactive workspace for bounded historical stable-asset peg deviation analysis.
 * Features state isolation, automatic cancellation of in-flight requests on parameter or wallet shifts,
 * and WCAG 2.2 AA accessibility support.
 */
export function PegWorkspace({
  initialFixture,
  connectedWallet,
  connectedNetwork,
}: PegWorkspaceProps) {
  const [formValues, setFormValues] = useState<AssetReferenceFormValues>({
    ...DEFAULT_FORM_VALUES,
    fixture: initialFixture,
  });

  const [analysisResult, setAnalysisResult] = useState<PegAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");

  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<number>(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    activeRequestIdRef.current += 1;
    const currentRequestId = activeRequestIdRef.current;

    const queryParams = new URLSearchParams({
      symbol: formValues.assetId.symbol,
      network: formValues.assetId.network,
      chainFamily: formValues.assetId.chainFamily,
      addressOrIssuer: formValues.assetId.addressOrIssuer,
      thresholdBps: formValues.thresholdBps.toString(),
      gapToleranceMs: (formValues.gapToleranceMinutes * 60_000).toString(),
    });

    if (formValues.fixture) {
      queryParams.set("fixture", formValues.fixture);
    }

    const fetchPromise = formValues.customDefinition
      ? fetch("/api/insights/peg-observations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId: formValues.assetId,
            customPegDefinition: formValues.customDefinition,
            thresholdBps: formValues.thresholdBps,
            gapToleranceMs: formValues.gapToleranceMinutes * 60_000,
            walletAddress: connectedWallet || undefined,
          }),
          signal: controller.signal,
        })
      : fetch(`/api/insights/peg-observations?${queryParams.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

    fetchPromise
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Analysis request failed with status ${response.status}`);
        }
        return response.json() as Promise<PegAnalysisResult>;
      })
      .then((data) => {
        if (!active || currentRequestId !== activeRequestIdRef.current) return;
        setAnalysisResult(data);
        setIsLoading(false);
        setErrorMessage(null);
        setLiveAnnouncement(
          `Analysis complete for ${data.pegDefinition.name}. Current deviation is ${
            data.summary.currentDeviationBps ?? 0
          } basis points. Coverage status: ${data.coverage.status}.`,
        );
      })
      .catch((err: unknown) => {
        if (!active || currentRequestId !== activeRequestIdRef.current) return;
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Failed to execute peg analysis";
        setErrorMessage(message);
        setIsLoading(false);
        setLiveAnnouncement(`Peg analysis failed: ${message}`);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [formValues, connectedWallet]);

  useEffect(() => {
    if (connectedNetwork && formValues.assetId.network !== connectedNetwork) {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }
    }
  }, [connectedNetwork, formValues.assetId.network]);

  function handleFormSubmit(newValues: AssetReferenceFormValues) {
    setIsLoading(true);
    setErrorMessage(null);
    setLiveAnnouncement(`Executing peg deviation analysis for ${newValues.assetId.symbol}...`);
    setFormValues(newValues);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <LiveRegion message={liveAnnouncement} politeness="polite" />

      <header className="rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900/90 to-zinc-950/90 p-6 backdrop-blur-md">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 text-xs font-mono text-zinc-300">
              <span>Stable-Asset Research Workspace</span>
              <span className="text-zinc-500">|</span>
              <span>Non-Unit Peg Analysis</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
              Peg Deviation Analysis
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Inspect historical deviations against declared asset pegs, track threshold breaches,
              and identify unobserved continuity gaps without assuming dollar unit parity.
            </p>
          </div>

          {analysisResult && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div>
                <div className="text-[11px] text-zinc-400">Peg Target</div>
                <div className="font-mono text-sm font-semibold text-zinc-200">
                  {analysisResult.pegDefinition.declaredTargetValue}{" "}
                  {analysisResult.pegDefinition.referenceCurrency}
                </div>
              </div>
              <div className="h-6 w-px bg-zinc-800" />
              <div>
                <div className="text-[11px] text-zinc-400">Current Price</div>
                <div className="font-mono text-sm font-semibold text-zinc-200">
                  {analysisResult.summary.currentPrice !== null
                    ? `${analysisResult.summary.currentPrice} ${analysisResult.pegDefinition.referenceCurrency}`
                    : "Unavailable"}
                </div>
              </div>
              <div className="h-6 w-px bg-zinc-800" />
              <div>
                <div className="text-[11px] text-zinc-400">Current Deviation</div>
                <div
                  className={`font-mono text-sm font-bold ${
                    analysisResult.summary.currentDeviationBps === null
                      ? "text-zinc-400"
                      : Math.abs(analysisResult.summary.currentDeviationBps) >=
                          formValues.thresholdBps
                        ? "text-rose-400"
                        : "text-emerald-400"
                  }`}
                >
                  {analysisResult.summary.currentDeviationBps !== null
                    ? `${analysisResult.summary.currentDeviationBps > 0 ? "+" : ""}${
                        analysisResult.summary.currentDeviationBps
                      } bps`
                    : "N/A"}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <AssetReferenceForm
        initialValues={formValues}
        onSubmit={handleFormSubmit}
        isLoading={isLoading}
      />

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-rose-800/80 bg-rose-950/50 p-4 text-xs text-rose-200 backdrop-blur-sm"
        >
          <span className="font-semibold">Analysis Error: </span>
          <span>{errorMessage}</span>
        </div>
      )}

      {analysisResult && (
        <div className="space-y-6">
          <ObservationCoverage coverage={analysisResult.coverage} />

          <DeviationChart
            observations={analysisResult.normalizedObservations}
            pegDefinition={analysisResult.pegDefinition}
            window={analysisResult.window}
            gaps={analysisResult.coverage.gapsDetected}
            thresholdBps={formValues.thresholdBps}
          />

          <EpisodeTable episodes={analysisResult.episodes} />
        </div>
      )}
    </div>
  );
}
