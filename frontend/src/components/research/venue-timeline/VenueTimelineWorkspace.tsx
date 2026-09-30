"use client";

import { useState, type FormEvent } from "react";

export function VenueTimelineWorkspace() {
  const [contract, setContract] = useState("");
  const [report, setReport] = useState<{
    venues: { venue: string; state: string; source: string }[];
    timeline: { venue: string; from: string | null; to: string; observedAt: string }[];
    coverage: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/insights/venue-timeline", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId: 1, contract, snapshots: [] }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setReport(null);
      setError(payload.message ?? "The token could not be mapped.");
      return;
    }
    setError(null);
    setReport(payload.report);
  }

  return (
    <section className="flex flex-col gap-6">
      <form aria-label="Venue timeline" onSubmit={onSubmit} className="flex flex-col gap-3">
        <label htmlFor="venue-contract">Token contract</label>
        <input id="venue-contract" value={contract} onChange={(event) => setContract(event.target.value)} />
        <button type="submit">Map venues</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {report ? (
        <article data-testid="venue-report">
          <h2>Current venues</h2>
          <table>
            <tbody>
              {report.venues.map((venue) => (
                <tr key={venue.venue}><td>{venue.venue}</td><td>{venue.state}</td><td>{venue.source}</td></tr>
              ))}
            </tbody>
          </table>
          <h2>Status timeline</h2>
          <ol>
            {report.timeline.map((item) => (
              <li key={`${item.venue}-${item.observedAt}`}>{item.venue} {item.from ?? "none"} to {item.to} at {item.observedAt}</li>
            ))}
          </ol>
          <p data-testid="coverage-notice">{report.coverage}</p>
        </article>
      ) : (
        <p data-testid="venue-idle">Missing venue data is unknown. It is not treated as still listed.</p>
      )}
    </section>
  );
}
