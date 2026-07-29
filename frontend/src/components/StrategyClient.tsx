"use client";

import { useEffect, useState } from "react";
import { RuleForm } from "@/components/RuleForm";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { UserRule } from "@/server/types";
import type { StrategyPreset } from "@/server/rules/presets";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rule: UserRule }
  | { status: "error"; message: string };

type LoadOutcome = { status: "ready"; rule: UserRule } | { status: "error"; message: string };

/** A settled result, tagged with the wallet it belongs to. */
type LoadResult = {
  address: string;
  outcome: LoadOutcome;
};

/**
 * Fetch one wallet's profile.
 *
 * Deliberately free of state updates so callers decide what to do with the
 * outcome — that keeps the effect below from writing state synchronously.
 */
async function fetchProfile(address: string): Promise<LoadOutcome> {
  try {
    const response = await fetch(`/api/rules?walletAddress=${encodeURIComponent(address)}`, {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        status: "error",
        message:
          typeof payload.error === "string" ? payload.error : `Could not load your strategy (${response.status})`,
      };
    }

    return { status: "ready", rule: payload.rule as UserRule };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not load your strategy.",
    };
  }
}

export type StrategyClientProps = {
  /** Profile rendered before a wallet is connected, and the fallback shape. */
  initialRules: UserRule;
  presets: StrategyPreset[];
  chains: { id: string; name: string; chainFamily: string }[];
  categories: string[];
};

/**
 * Wallet-scoped strategy editor.
 *
 * The profile is keyed by the connected wallet, so connecting, switching or
 * disconnecting a wallet reloads the right profile rather than leaving another
 * wallet's limits on screen.
 */
export function StrategyClient({ initialRules, presets, chains, categories }: StrategyClientProps) {
  const wallet = useWalletSession();
  const walletAddress = wallet.address;
  // Only settled results are stored, each tagged with the wallet it describes.
  // "idle" and "loading" are derived below rather than written from the effect,
  // which keeps the effect free of synchronous state updates and makes a stale
  // response for a previous wallet impossible to display.
  const [result, setResult] = useState<LoadResult | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    let cancelled = false;

    // State is written only from the promise callback, never synchronously from
    // the effect body. The cancelled flag drops a response that arrives after
    // the wallet changed, so a slow request cannot overwrite a newer profile.
    fetchProfile(walletAddress).then((outcome) => {
      if (!cancelled) {
        setResult({ address: walletAddress, outcome });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const loadState: LoadState = !walletAddress
    ? { status: "idle" }
    : result !== null && result.address === walletAddress
      ? result.outcome
      : { status: "loading" };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Strategy</h1>
          <p className="mt-1 text-sm text-white/56">
            {walletAddress
              ? `Profile for ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
              : "No wallet connected"}
          </p>
        </div>
        <span className="text-sm text-white/46">Wallet approval required</span>
      </section>

      {/* One live region owns load status so a screen reader hears each
          transition once, rather than the form re-announcing itself. */}
      <p aria-live="polite" className="sr-only">
        {loadState.status === "loading" ? "Loading your strategy profile" : null}
        {loadState.status === "ready" ? "Strategy profile loaded" : null}
      </p>

      {loadState.status === "loading" ? (
        <p className="glass-panel rounded-lg p-6 text-sm text-white/64">Loading your strategy…</p>
      ) : null}

      {loadState.status === "error" ? (
        <div role="alert" className="glass-panel rounded-lg border border-red-400/40 p-6">
          <p className="text-sm text-red-300">{loadState.message}</p>
          <button
            type="button"
            onClick={() => {
              if (!walletAddress) {
                return;
              }

              // Clearing the settled result puts the view back into the derived
              // loading state while the retry is in flight.
              setResult(null);
              void fetchProfile(walletAddress).then((outcome) => setResult({ address: walletAddress, outcome }));
            }}
            className="mt-3 h-11 rounded-full border border-white/20 px-5 text-sm font-medium hover:border-white/40"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loadState.status !== "loading" && loadState.status !== "error" ? (
        <RuleForm
          // Remounting on wallet change discards any half-edited state that
          // belonged to the previous wallet.
          key={walletAddress ?? "disconnected"}
          initialRules={loadState.status === "ready" ? loadState.rule : initialRules}
          presets={presets}
          chains={chains}
          categories={categories}
          walletAddress={walletAddress}
        />
      ) : null}
    </div>
  );
}
