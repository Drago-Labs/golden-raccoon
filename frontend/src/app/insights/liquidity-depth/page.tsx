"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { LiquidityWorkbench } from "@/components/research/liquidity-depth";

function LiquidityDepthContent() {
  const searchParams = useSearchParams();
  const initialBase = searchParams.get("base") || "XLM";
  const initialQuote = searchParams.get("quote") || "USDC";
  const initialNetwork = searchParams.get("network") || "stellar-pubnet";

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="text-xs text-white/50">
            Market Research & Liquidity Capacity
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <LiquidityWorkbench
          initialBase={initialBase}
          initialQuote={initialQuote}
          initialNetwork={initialNetwork}
        />
      </main>
    </div>
  );
}

export default function LiquidityDepthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black">
          <RefreshCw className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      }
    >
      <LiquidityDepthContent />
    </Suspense>
  );
}
