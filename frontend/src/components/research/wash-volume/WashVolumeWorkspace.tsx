"use client";

import { useState, type FormEvent } from "react";

export function WashVolumeWorkspace() {
  const [pair, setPair] = useState("");
  const [report, setReport] = useState<{
    coverage: string;
    grossVolume: number;
    filters: { id: string; label: string; excludedVolume: number; remainingVolume: number; falsePositives: string }[];
    heuristic: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/insights/wash-volume", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pair, trades: [] }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setReport(null);
      setError(payload.message ?? "The pair could not be analyzed.");
      return;
    }
    setError(null);
    setReport(payload.report);
  }

  return (
    <section className="flex flex-col gap-6">
      <form aria-label="Wash volume analysis" onSubmit={onSubmit} className="flex flex-col gap-3">
        <label htmlFor="wash-pair">Pair</label>
        <input id="wash-pair" value={pair} onChange={(event) => setPair(event.target.value)} />
        <button type="submit">Analyze volume</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {report ? (
        <article data-testid="wash-report">
          <h2>Volume waterfall</h2>
          <p>Gross volume {report.grossVolume}. Coverage {report.coverage}.</p>
          <table>
            <thead>
              <tr><th>Pattern</th><th>Excluded</th><th>Remaining</th></tr>
            </thead>
            <tbody>
              {report.filters.map((filter) => (
                <tr key={filter.id}>
                  <td>{filter.label}</td>
                  <td>{filter.excludedVolume}</td>
                  <td>{filter.remainingVolume}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Example trades</h2>
          <p>{report.heuristic}</p>
          <ul>
            {report.filters.map((filter) => (
              <li key={filter.id}>{filter.falsePositives}</li>
            ))}
          </ul>
          <p data-testid="coverage-notice">{report.coverage === "partial" ? "History is partial." : "History is complete for the fetched range."}</p>
        </article>
      ) : (
        <p data-testid="wash-idle">Volume figures are heuristic evidence, not an accusation.</p>
      )}
    </section>
  );
}
