"use client";

import { FormEvent, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import type { RegionalNewsReport } from "@/server/research/regional-news";

export function RegionalNewsWorkspace() {
  const [symbol, setSymbol] = useState("");
  const [chain, setChain] = useState("");
  const [contractOrIssuer, setContractOrIssuer] = useState("");
  const [view, setView] = useState<{ report?: RegionalNewsReport; error?: string; busy: boolean }>({ busy: false });
  const generation = useRef(0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const token = ++generation.current;
    setView({ busy: true });
    try {
      const response = await fetch("/api/insights/regional-news", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: symbol || undefined,
          chain: chain || undefined,
          contractOrIssuer: contractOrIssuer || undefined,
        }),
      });
      const body = (await response.json()) as { report?: RegionalNewsReport; error?: string; message?: string };
      if (token !== generation.current) return;
      if (!response.ok || !body.report) throw new Error(body.message ?? body.error ?? "Regional news read failed");
      setView({ report: body.report, busy: false });
    } catch (error) {
      if (token === generation.current) {
        setView({ error: error instanceof Error ? error.message : "Regional news read failed", busy: false });
      }
    }
  }

  const report = view.report;
  const status =
    view.busy
      ? "Loading regional news coverage"
      : view.error
        ? view.error
        : report
          ? `Coverage ready. ${report.coverage.healthySourceCount} healthy sources, ${report.articles.length} articles.`
          : null;

  return (
    <div className="space-y-6" data-testid="regional-news-workspace">
      <header>
        <div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">News insight</div>
        <h1 className="text-3xl font-semibold">Regional source coverage</h1>
        <p className="max-w-3xl text-sm text-white/55">
          Bounded regional feeds with original-language text kept beside every translation. Configured is not fetched;
          failed sources lower coverage and never invent evidence.
        </p>
      </header>

      <form onSubmit={submit} className="glass-panel grid gap-4 rounded-2xl p-5">
        <label className="grid gap-1 text-sm">
          Symbol (optional)
          <input aria-label="Symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} className="rounded border border-white/15 bg-black/40 p-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Chain (optional)
          <input aria-label="Chain" value={chain} onChange={(event) => setChain(event.target.value)} className="rounded border border-white/15 bg-black/40 p-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Contract or issuer (optional)
          <input
            aria-label="Contract or issuer"
            value={contractOrIssuer}
            onChange={(event) => setContractOrIssuer(event.target.value)}
            className="rounded border border-white/15 bg-black/40 p-2 font-mono"
          />
        </label>
        <button type="submit" disabled={view.busy} className="rounded bg-[#d9a441] px-4 py-2 font-medium text-black disabled:opacity-50">
          {view.busy ? "Loading…" : "Load regional coverage"}
        </button>
      </form>

      <LiveRegion message={status} politeness={view.error ? "assertive" : "polite"} />
      {view.error ? <div role="alert">{view.error}</div> : null}

      {report ? (
        <section className="space-y-6" aria-labelledby="regional-coverage-heading">
          <div>
            <h2 id="regional-coverage-heading" className="text-xl font-semibold">
              Coverage
            </h2>
            <p className="text-sm text-white/60">
              Languages {report.coverage.languages.join(", ") || "none"} · Regions {report.coverage.regions.join(", ")} ·
              Healthy {report.coverage.healthySourceCount} · Failed {report.coverage.failedSourceCount} · Needs review{" "}
              {report.coverage.untranslatedCount} · Duplicate syndication {report.coverage.duplicateSyndicationCount}
            </p>
            <p className="text-xs text-white/45">{report.coverage.note}</p>
            <p className="text-xs text-white/45">Score unchanged: {String(report.scoreUnchanged)}</p>
          </div>

          <table className="w-full text-left text-sm">
            <caption className="sr-only">Regional source registry health</caption>
            <thead>
              <tr>
                <th scope="col">Publisher</th>
                <th scope="col">Language</th>
                <th scope="col">Region</th>
                <th scope="col">Health</th>
              </tr>
            </thead>
            <tbody>
              {report.sources.map((source) => (
                <tr key={source.id}>
                  <td>{source.publisher}</td>
                  <td>{source.language}</td>
                  <td>{source.region}</td>
                  <td>{source.health}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="w-full text-left text-sm">
            <caption className="sr-only">Articles with original language and translation evidence</caption>
            <thead>
              <tr>
                <th scope="col">Original</th>
                <th scope="col">Translation</th>
                <th scope="col">Language</th>
                <th scope="col">Confidence</th>
                <th scope="col">Review</th>
                <th scope="col">Source URL</th>
              </tr>
            </thead>
            <tbody>
              {report.articles.length === 0 ? (
                <tr>
                  <td colSpan={6}>No articles fetched in this observation.</td>
                </tr>
              ) : (
                report.articles.map((article) => (
                  <tr key={article.articleId}>
                    <td>{article.translation.originalTitle}</td>
                    <td>
                      {article.translation.translatedTitle ?? "unavailable"}
                      {article.translation.state !== "ok" && article.translation.state !== "skipped" ? (
                        <span className="ml-2 text-xs text-amber-200">({article.translation.state})</span>
                      ) : null}
                    </td>
                    <td>
                      {article.language} ({article.languageConfidence.toFixed(2)})
                    </td>
                    <td>{article.translation.confidence.toFixed(2)}</td>
                    <td>{article.translation.needsManualReview ? "manual review" : "ok"}</td>
                    <td className="font-mono text-xs">{article.canonicalUrl}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
