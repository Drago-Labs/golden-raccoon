"use client";

import { useRef, useState, type FormEvent } from "react";
import type { ReserveReport } from "@/server/research/reserve-attestation";

const SAMPLE_REQUEST = {
  windowStart: "2026-01-01T00:00:00Z",
  windowEnd: "2026-04-01T00:00:00Z",
  lateAfterSeconds: 2_592_000,
  registry: [{ assetCode: "USDX", issuer: "Example Issuer Ltd", permittedSourceLabels: [] }],
  reports: [
    {
      assetCode: "USDX",
      issuer: "Example Issuer Ltd",
      sourceType: "independent_attestation",
      sourceLabel: "Example Accounting Firm",
      reportingPeriodStart: "2026-01-01T00:00:00Z",
      reportingPeriodEnd: "2026-01-31T00:00:00Z",
      retrievedAt: "2026-02-05T00:00:00Z",
      documentUrl: "https://example.com/reports/jan-2026.pdf",
      documentHash: "a".repeat(64),
      currency: "USD",
      claimedAssets: "1000000",
      claimedLiabilities: "1000000",
    },
  ],
};

function statusLabel(status: string): string {
  if (status === "on_time") return "On time";
  if (status === "late") return "Late";
  return "Unlisted source";
}

export function ReserveAttestationWorkspace() {
  const [text, setText] = useState(() => JSON.stringify(SAMPLE_REQUEST, null, 2));
  const [report, setReport] = useState<ReserveReport | null>(null);
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
      const response = await fetch("/api/insights/reserve-attestation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { report?: ReserveReport; error?: string; message?: string };
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
        <div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">Stable assets insight</div>
        <h1 className="mt-1 text-3xl font-semibold">Reserve attestation evidence workspace</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Reviews the reserve reports you already hold against an explicit asset-plus-issuer registry. A report for
          an unregistered issuer is never attributed to a similarly named one, a missing report or a currency
          mismatch never becomes a 100% backed claim, and every figure links back to its exact document hash and
          retrieval time. This is not an audit and not investment advice.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-3">
        <label className="flex flex-col gap-1 text-sm" htmlFor="reserve-request">
          <span>Request JSON (registry and reports)</span>
          <textarea id="reserve-request" value={text} onChange={(event) => setText(event.target.value)} rows={14} className="rounded-lg border border-white/15 bg-transparent p-3 font-mono text-xs" />
        </label>
        <button type="submit" disabled={busy} className="rounded-lg border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-50">
          {busy ? "Reviewing…" : "Review evidence"}
        </button>
      </form>

      <div aria-live="polite" className="sr-only">{busy ? "Reserve evidence review loading" : report ? "Reserve evidence review complete" : error ?? ""}</div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}

      {report && (
        <section aria-label="Reserve evidence results" className="space-y-6">
          {report.unregisteredReports.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200">
              {report.unregisteredReports.map((entry) => (
                <li key={entry.documentHash}>
                  A report for {entry.assetCode} / {entry.issuer} matches no registered asset+issuer and was excluded.
                </li>
              ))}
            </ul>
          )}

          {report.assets.map((asset) => (
            <div key={`${asset.registryEntry.assetCode}-${asset.registryEntry.issuer}`} className="space-y-3 rounded-xl border border-white/10 p-5">
              <h2 className="text-lg font-medium">{asset.registryEntry.assetCode} — {asset.registryEntry.issuer}</h2>
              <p className="text-sm text-white/60">
                {asset.state === "no_evidence"
                  ? "No reports in this window: coverage is unknown, not zero risk."
                  : asset.latestCoverageRatioBps === null
                    ? "The latest report cannot be reduced to a single coverage ratio."
                    : `Latest reported coverage: ${(asset.latestCoverageRatioBps / 100).toFixed(2)}%`}
              </p>

              {asset.evidence.length > 0 && (
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Evidence timeline for {asset.registryEntry.assetCode} / {asset.registryEntry.issuer}</caption>
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-white/50">
                      <th scope="col" className="pb-2">Period end</th>
                      <th scope="col" className="pb-2">Source</th>
                      <th scope="col" className="pb-2">Status</th>
                      <th scope="col" className="pb-2">Coverage</th>
                      <th scope="col" className="pb-2">Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asset.evidence.map((entry) => (
                      <tr key={entry.documentHash} className="border-t border-white/10">
                        <td className="py-2 text-xs">{entry.reportingPeriodEnd}</td>
                        <td className="py-2">
                          {entry.sourceLabel} ({entry.sourceType === "independent_attestation" ? "independent" : "issuer statement"})
                        </td>
                        <td className="py-2">{statusLabel(entry.status)}{entry.superseded ? " (superseded)" : ""}</td>
                        <td className="py-2">{entry.coverageRatioBps === null ? entry.coverageNote || "unavailable" : `${(entry.coverageRatioBps / 100).toFixed(2)}%`}</td>
                        <td className="py-2 font-mono text-xs">
                          <a href={entry.documentUrl} className="underline underline-offset-2">{entry.documentHash.slice(0, 12)}…</a>
                          <span className="block text-white/40">retrieved {entry.retrievedAt}</span>
                        </td>
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
