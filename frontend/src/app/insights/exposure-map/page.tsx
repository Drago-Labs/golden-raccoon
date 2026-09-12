"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ExposureMap } from "@/components/research/exposure-map";
import type { ExposureMapResult } from "@/server/research/exposure-map/schema";
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

function ExposureMapPageContent() {
  const searchParams = useSearchParams();
  const initialWallet = searchParams.get("walletAddress") || "";
  const initialChain = searchParams.get("chain") || "";

  const [walletAddress, setWalletAddress] = useState(initialWallet);
  const chain = initialChain;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExposureMapResult | null>(null);

  const activeRequestIdRef = useRef(0);

  const fetchExposureMap = useCallback(async (targetWallet?: string, targetChain?: string) => {
    const requestId = ++activeRequestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (targetWallet) params.set("walletAddress", targetWallet);
      if (targetChain) params.set("chain", targetChain);

      const query = params.toString();
      const endpoint = query ? `/api/insights/exposure-map?${query}` : "/api/insights/exposure-map";

      const res = await fetch(endpoint, {
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || `HTTP ${res.status}: Failed to load exposure map`);
      }

      const json = (await res.json()) as ExposureMapResult;

      if (requestId === activeRequestIdRef.current) {
        setData(json);
      }
    } catch (err) {
      if (requestId === activeRequestIdRef.current) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadInitialData = async () => {
      try {
        const params = new URLSearchParams();
        if (initialWallet) params.set("walletAddress", initialWallet);
        if (initialChain) params.set("chain", initialChain);

        const query = params.toString();
        const endpoint = query ? `/api/insights/exposure-map?${query}` : "/api/insights/exposure-map";

        const res = await fetch(endpoint, {
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          throw new Error(errorBody.error || `HTTP ${res.status}: Failed to load exposure map`);
        }

        const json = (await res.json()) as ExposureMapResult;
        if (active) {
          setData(json);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "An unexpected error occurred");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadInitialData();

    return () => {
      active = false;
    };
  }, [initialWallet, initialChain]);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <div className="border-b border-zinc-800/80 bg-zinc-950/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Wallet address (optional)..."
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    fetchExposureMap(walletAddress, chain);
                  }
                }}
                className="w-56 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-purple-500 focus:outline-none sm:w-72"
                aria-label="Filter by wallet address"
              />
            </div>

            <button
              type="button"
              onClick={() => fetchExposureMap(walletAddress, chain)}
              disabled={loading}
              className="rounded-xl bg-purple-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-purple-500 disabled:opacity-50"
            >
              Analyze
            </button>
          </div>
        </div>
      </div>

      <main className="py-6">
        {loading && (
          <div className="mx-auto max-w-7xl px-4 py-24 text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-purple-400" />
            <p className="mt-4 text-sm font-medium text-zinc-400">
              Traversing dependencies and mapping shared exposure...
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="mx-auto max-w-3xl px-4 py-12">
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-300">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-rose-400" />
                <h2 className="text-base font-semibold">Exposure Analysis Failed</h2>
              </div>
              <p className="mt-2 text-xs text-rose-300/80">{error}</p>
              <button
                type="button"
                onClick={() => fetchExposureMap(walletAddress, chain)}
                className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/20 px-4 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-500/30"
              >
                Retry Request
              </button>
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <ExposureMap
            result={data}
            onRefresh={() => fetchExposureMap(walletAddress, chain)}
            isLoading={loading}
          />
        )}
      </main>
    </div>
  );
}

export default function ExposureMapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black">
          <RefreshCw className="h-8 w-8 animate-spin text-purple-400" />
        </div>
      }
    >
      <ExposureMapPageContent />
    </Suspense>
  );
}
