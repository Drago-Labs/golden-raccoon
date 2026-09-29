"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { ReviewList } from "./ReviewList";
import type { SpamDustReport, VisibilityPreference } from "@/server/research/spam-dust-review/schema";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: SpamDustReport }
  | { status: "error"; code: string; message: string };

export type SpamDustInput = {
  walletId: string;
  chainId: string;
  generatedAt: string;
  providerStatus?: "connected" | "unavailable";
  holdings: unknown[];
  preferences?: VisibilityPreference[];
};

/**
 * Wallet-scoped spam/dust review workspace.
 *
 * Local preferences are the source of truth for hide/show. The API receives them
 * on each review pass; the holdings payload itself is never rewritten.
 */
export function SpamDustPanel(props: {
  input?: SpamDustInput | null;
  account?: string | null;
  network?: string | null;
  endpoint?: string;
}) {
  const sessionKey = `${(props.account ?? props.input?.walletId ?? "anonymous").toLowerCase()}|${props.network ?? props.input?.chainId ?? "unknown"}`;

  return (
    <PanelSession
      key={sessionKey}
      sessionKey={sessionKey}
      input={props.input ?? null}
      endpoint={props.endpoint ?? "/api/insights/spam-dust-review"}
    />
  );
}

function PanelSession({
  sessionKey,
  input,
  endpoint,
}: {
  sessionKey: string;
  input: SpamDustInput | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [preferences, setPreferences] = useState<VisibilityPreference[]>(input?.preferences ?? []);
  const [preferenceVersion, setPreferenceVersion] = useState(0);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const generation = useRef(0);
  const originalHoldings = useMemo(() => JSON.stringify(input?.holdings ?? []), [input?.holdings]);

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
          body: JSON.stringify({ ...input, preferences: preferencesRef.current }),
        });
      })
      .then(async (response) => {
        if (!response || requestGeneration !== generation.current) return;
        const payload = await response.json();
        if (requestGeneration !== generation.current) return;

        if (!response.ok) {
          setState({
            status: "error",
            code: typeof payload?.error === "string" ? payload.error : "spam_dust_review_failed",
            message: typeof payload?.message === "string" ? payload.message : "The review could not be completed.",
          });
          return;
        }

        setState({ status: "ready", report: payload.report });
      })
      .catch(() => {
        if (requestGeneration !== generation.current) return;
        setState({ status: "error", code: "network_error", message: "The review request could not be completed." });
      });

    return () => {
      generation.current += 1;
    };
  }, [endpoint, input, preferenceVersion, sessionKey]);

  const report = state.status === "ready" ? state.report : null;

  function toggleHidden(assetKey: string, hidden: boolean) {
    const updatedAt = new Date().toISOString();
    setPreferences((current) => {
      const next = current.filter((preference) => preference.assetKey !== assetKey);
      next.push({ assetKey, hidden, updatedAt });
      return next;
    });
    setPreferenceVersion((value) => value + 1);
  }

  const statusMessage =
    state.status === "loading"
      ? "Reviewing spam and dust signals."
      : state.status === "error"
        ? `Review failed: ${state.message}`
        : report
          ? `Review ready. ${report.coverage.hiddenCount} hidden. ${report.coverage.reviewRecommendedCount} recommended for review.`
          : "";

  return (
    <div className="space-y-6" data-testid="spam-dust-panel">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No wallet holdings are loaded. Open this workspace with a portfolio snapshot to classify spam and dust signals
          without mutating on-chain holdings.
        </p>
      ) : null}

      {state.status === "loading" && !report ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Reviewing holdings…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">The review could not be completed.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {report ? (
        <>
          <section aria-labelledby="spam-dust-summary-heading" className="rounded-xl border border-white/10 p-4">
            <h2 id="spam-dust-summary-heading" className="text-sm font-semibold">
              Wallet {report.walletId}
            </h2>
            <p className="mt-1 text-xs text-subtle">
              {report.chainId} · {report.generatedAt}
            </p>
            <p className="mt-2 text-xs text-subtle" data-testid="coverage-note">
              Coverage: {report.coverage.state}. {report.coverage.note}
            </p>
            <p className="mt-2 text-xs text-subtle" data-testid="uncertainty-note">
              {report.uncertainty.note} Hidden value ${report.uncertainty.hiddenValueUsd.toFixed(4)}.
            </p>
            <p className="mt-2 text-xs text-subtle" data-testid="portfolio-unchanged">
              Portfolio record unchanged: {report.portfolioUnchanged ? "yes" : "no"}. Input holdings fingerprint length{" "}
              {originalHoldings.length}.
            </p>
          </section>

          <section aria-labelledby="spam-dust-list-heading">
            <h2 id="spam-dust-list-heading" className="text-sm font-semibold">
              Review list ({report.holdings.length}) · hidden {report.coverage.hiddenCount}
            </h2>
            <div className="mt-3">
              <ReviewList holdings={report.holdings} onToggleHidden={toggleHidden} />
            </div>
          </section>

          <section aria-labelledby="spam-dust-export-heading">
            <h2 id="spam-dust-export-heading" className="text-sm font-semibold">
              Exportable preferences
            </h2>
            <pre
              className="mt-3 overflow-x-auto rounded-xl border border-white/10 p-3 text-[11px] text-subtle"
              data-testid="preference-export"
            >
              {JSON.stringify(report.preferenceExport, null, 2)}
            </pre>
          </section>
        </>
      ) : null}
    </div>
  );
}
