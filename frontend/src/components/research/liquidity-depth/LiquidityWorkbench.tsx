"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, ShieldCheck, AlertCircle } from "lucide-react";
import { type LiquidityDepthResult } from "@/server/research/liquidity-depth/schema";
import { VenueSelector } from "./VenueSelector";
import { DepthChart } from "./DepthChart";
import { SizeLadder } from "./SizeLadder";
import { CoverageNotice } from "./CoverageNotice";

export type LiquidityWorkbenchProps = {
  initialBase?: string;
  initialQuote?: string;
  initialNetwork?: string;
};

export function LiquidityWorkbench({
  initialBase = "XLM",
  initialQuote = "USDC",
  initialNetwork = "stellar-pubnet",
}: LiquidityWorkbenchProps) {
  const [selectedNetwork, setSelectedNetwork] = useState(initialNetwork);
  const [baseSymbol, setBaseSymbol] = useState(initialBase);
  const [quoteSymbol, setQuoteSymbol] = useState(initialQuote);
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");

  const [data, setData] = useState<LiquidityDepthResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const activeRequestIdRef = useRef<number>(0);

  const fetchData = useCallback(async () => {
    const requestId = ++activeRequestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        base: baseSymbol,
        quote: quoteSymbol,
        network: selectedNetwork,
        side: tradeSide,
      });

      const res = await fetch(`/api/insights/liquidity-depth?${query.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error ${res.status}`);
      }

      const result: LiquidityDepthResult = await res.json();
      setData(result);
    } catch (err) {
      if (requestId !== activeRequestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load liquidity depth");
      setData(null);
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [baseSymbol, quoteSymbol, selectedNetwork, tradeSide]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  return (
    <div className="space-y-6" role="main" aria-label="Liquidity Depth Analysis Workbench">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Markets: Liquidity Depth & Capacity
          </h1>
          <p className="mt-1 text-xs text-white/50 sm:text-sm">
            Simulate trade execution sizes, analyze continuous and discrete depth curves, and verify impact limits.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          aria-label="Refresh liquidity analysis"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <VenueSelector
        selectedNetwork={selectedNetwork}
        onSelectNetwork={(net) => {
          setSelectedNetwork(net);
          if (net.startsWith("stellar") && baseSymbol === "ETH") {
            setBaseSymbol("XLM");
          } else if (!net.startsWith("stellar") && baseSymbol === "XLM") {
            setBaseSymbol("ETH");
          }
        }}
        baseSymbol={baseSymbol}
        onChangeBaseSymbol={setBaseSymbol}
        quoteSymbol={quoteSymbol}
        onChangeQuoteSymbol={setQuoteSymbol}
        tradeSide={tradeSide}
        onToggleSide={setTradeSide}
        modelType={data?.venue.modelType || "orderbook"}
        venueName={data?.venue.venueName || "Resolving venue..."}
        feeBps={data?.venue.feeBps || 0}
      />

      {loading && (
        <div
          className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/5 text-white/60"
          aria-busy="true"
          aria-live="polite"
        >
          <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" aria-hidden="true" />
          <span className="text-sm">Evaluating venue liquidity and capacity curves...</span>
        </div>
      )}

      {error && !loading && (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-6 text-center text-rose-300"
          role="alert"
        >
          <AlertCircle className="h-8 w-8 text-rose-400" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-white">Liquidity Evaluation Failed</h3>
            <p className="mt-1 text-xs text-rose-200/80">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="mt-2 rounded border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500/30"
          >
            Retry Analysis
          </button>
        </div>
      )}

      {data && !loading && (
        <>
          <CoverageNotice
            coverage={data.coverage}
            modelType={data.venue.modelType}
            venueName={data.venue.venueName}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="region" aria-label="Trade Size Capacity Summary">
            {data.capacity.thresholds.map((t) => (
              <div
                key={t.maxImpactPercent}
                className="rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div className="text-xs text-white/50">Capacity at {t.maxImpactPercent}% Impact</div>
                <div className="mt-1 text-base font-bold text-white">
                  {Number(t.maxBaseCapacity).toLocaleString()} <span className="text-xs font-normal text-white/60">{baseSymbol}</span>
                </div>
                <div className="text-xs text-white/40">
                  ≈ {Number(t.maxQuoteCapacity).toLocaleString()} {quoteSymbol}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DepthChart
              curve={data.curve}
              baseSymbol={baseSymbol}
              quoteSymbol={quoteSymbol}
            />

            <SizeLadder
              ladder={data.ladder}
              baseSymbol={baseSymbol}
              quoteSymbol={quoteSymbol}
              tradeSide={tradeSide}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/40">
            <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" aria-hidden="true" />
            <span>{data.disclaimer}</span>
          </div>
        </>
      )}
    </div>
  );
}
