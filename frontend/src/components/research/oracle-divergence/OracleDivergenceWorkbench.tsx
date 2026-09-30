"use client";

import { useRef, useState, type FormEvent } from "react";
import type { OracleReport } from "@/server/research/oracle-divergence";

const SAMPLE_REQUEST = {
  windowStart: "2026-01-01T00:00:00Z",
  windowEnd: "2026-01-01T06:00:00Z",
  staleAfterSeconds: 3_600,
  pairs: [{ pairId: "eth-usd", baseAsset: "ETH", quoteAsset: "USD" }],
  feeds: [{ feedId: "chainlink-eth-usd", pairId: "eth-usd", chainId: "ethereum", providerLabel: "Chainlink", decimals: 8, heartbeatSeconds: 3_600, inverted: false, paused: false }],
  rounds: [{ feedId: "chainlink-eth-usd", roundId: "1", rawAnswer: "180000000000", updatedAt: "2026-01-01T00:00:00Z" }],
  quotes: [{ pairId: "eth-usd", price: "1801.10", sourceLabel: "DEX TWAP", observedAt: "2026-01-01T00:05:00Z" }],
};

function stateLabel(state: string): string {
  if (state === "compared") return "Compared";
  if (state === "stale_feed") return "Stale feed";
  if (state === "missing_feed") return "No round at this time";
  return "Paused feed";
}

export function OracleDivergenceWorkbench() {
  const [text, setText] = useState(() => JSON.stringify(SAMPLE_REQUEST, null, 2));
  const [report, setReport] = useState<OracleReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      setError("The request is not valid JSON.");
      return;
    }
    const requestGeneration = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/oracle-divergence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { report?: OracleReport; error?: string; message?: string };
      if (requestGeneration !== generation.current) return;
      if (!response.ok || !body.report) throw new Error(body.message ?? body.error ?? `Analysis failed (${response.status})`);
      setReport(body.report);
    } catch (caught) {
      if (requestGeneration === generation.current) {
        setError(caught instanceof Error ? caught.message : "Analysis failed");
        setReport(null);
      }
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-white/10 pb-5">
        <div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">Markets insight</div>
        <h1 className="mt-1 text-3xl font-semibold">Oracle divergence workbench</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Compares configured oracle rounds against configured market quotes for the pairs you declare. A quote
          mapped to a pair nobody declared, or a chain/currency mismatch, never produces a numerical spread — it is
          reported separately instead. Outdated rounds and windows with no data are marked unavailable or partial,
          never averaged in as if they were current.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-3">
        <label className="flex flex-col gap-1 text-sm" htmlFor="oracle-request">
          <span>Request JSON (pairs, feeds, rounds, quotes)</span>
          <textarea id="oracle-request" value={text} onChange={(event) => setText(event.target.value)} rows={14} className="rounded-lg border border-white/15 bg-transparent p-3 font-mono text-xs" />
        </label>
        <button type="submit" disabled={busy} className="rounded-lg border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-50">
          {busy ? "Comparing…" : "Compare feeds to quotes"}
        </button>
      </form>

      <div aria-live="polite" className="sr-only">{busy ? "Oracle divergence analysis loading" : report ? "Oracle divergence analysis complete" : error ?? ""}</div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}

      {report && (
        <section aria-label="Divergence results" className="space-y-6">
          {(report.unmappedFeedIds.length > 0 || report.unmappedQuotePairIds.length > 0) && (
            <ul className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200">
              {report.unmappedFeedIds.map((id) => (
                <li key={`feed-${id}`}>Feed &quot;{id}&quot; references a pair nobody declared and was excluded.</li>
              ))}
              {report.unmappedQuotePairIds.map((id) => (
                <li key={`quote-${id}`}>Quotes for pair &quot;{id}&quot; reference a pair nobody declared and were excluded.</li>
              ))}
            </ul>
          )}

          {report.pairs.map((pair) => (
            <div key={pair.pair.pairId} className="space-y-3 rounded-xl border border-white/10 p-5">
              <h2 className="text-lg font-medium">{pair.pair.baseAsset}/{pair.pair.quoteAsset}</h2>

              {pair.feedSummaries.length > 0 && (
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Feed summary for {pair.pair.pairId}</caption>
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-white/50">
                      <th scope="col" className="pb-2">Feed</th>
                      <th scope="col" className="pb-2">Compared</th>
                      <th scope="col" className="pb-2">Stale</th>
                      <th scope="col" className="pb-2">Missing</th>
                      <th scope="col" className="pb-2">Max |spread|</th>
                      <th scope="col" className="pb-2">Avg spread</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pair.feedSummaries.map((summary) => (
                      <tr key={summary.feedId} className="border-t border-white/10">
                        <td className="py-2">{summary.providerLabel}</td>
                        <td className="py-2">{summary.comparedCount}</td>
                        <td className="py-2">{summary.staleCount}</td>
                        <td className="py-2">{summary.missingCount}</td>
                        <td className="py-2">{summary.maxAbsSpreadBps === null ? "—" : `${(summary.maxAbsSpreadBps / 100).toFixed(2)}%`}</td>
                        <td className="py-2">{summary.averageSpreadBps === null ? "—" : `${(summary.averageSpreadBps / 100).toFixed(2)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {pair.comparisons.length > 0 && (
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Quote-by-quote comparisons for {pair.pair.pairId}</caption>
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-white/50">
                      <th scope="col" className="pb-2">Observed at</th>
                      <th scope="col" className="pb-2">Source</th>
                      <th scope="col" className="pb-2">Quote price</th>
                      <th scope="col" className="pb-2">Oracle price</th>
                      <th scope="col" className="pb-2">Spread</th>
                      <th scope="col" className="pb-2">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pair.comparisons.map((comparison, index) => (
                      <tr key={`${comparison.feedId}-${comparison.observedAt}-${index}`} className="border-t border-white/10">
                        <td className="py-2 text-xs">{comparison.observedAt}</td>
                        <td className="py-2">{comparison.sourceLabel}</td>
                        <td className="py-2">{comparison.quotePrice}</td>
                        <td className="py-2">{comparison.oraclePrice ?? "unavailable"}</td>
                        <td className="py-2">{comparison.spreadBps === null ? "—" : `${(comparison.spreadBps / 100).toFixed(2)}%`}</td>
                        <td className="py-2">{stateLabel(comparison.state)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
