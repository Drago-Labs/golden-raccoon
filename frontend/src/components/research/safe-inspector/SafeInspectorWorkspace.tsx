"use client";

import { useState, type FormEvent } from "react";

export function SafeInspectorWorkspace() {
  const [address, setAddress] = useState("");
  const [report, setReport] = useState<{
    supported: boolean;
    version: string | null;
    owners: string[];
    threshold: number | null;
    modules: { address: string; review: string }[];
    guard: { address: string | null; review: string };
    events: { type: string; block: number }[];
    control: string;
    coverage: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/insights/safe-inspector", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setReport(null);
      setError(payload.message ?? "The address could not be inspected.");
      return;
    }
    setError(null);
    setReport(payload.report);
  }

  return (
    <section className="flex flex-col gap-6">
      <form aria-label="Safe inspection" onSubmit={onSubmit} className="flex flex-col gap-3">
        <label htmlFor="safe-address">Safe address</label>
        <input id="safe-address" value={address} onChange={(event) => setAddress(event.target.value)} />
        <button type="submit">Inspect Safe</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {report ? (
        <article data-testid="safe-report">
          <h2>Owners and threshold</h2>
          <p>{report.supported ? `Safe ${report.version}` : "Unsupported address"}</p>
          <p>Threshold {report.threshold ?? "none"}. Owners: {report.owners.join(", ") || "none"}.</p>
          <h2>Modules and guard</h2>
          <p data-testid="module-panel">
            {report.modules.map((item) => `${item.address} (${item.review}, threshold bypass)`).join("; ") || "No modules."}
          </p>
          <p>Guard {report.guard.address ?? "none"} is {report.guard.review}.</p>
          <h2>Change timeline</h2>
          <ol>
            {report.events.map((item) => (
              <li key={`${item.type}-${item.block}`}>{item.type} at block {item.block}</li>
            ))}
          </ol>
          <p>{report.control}</p>
          <p data-testid="coverage-notice">{report.coverage}</p>
        </article>
      ) : (
        <p data-testid="safe-idle">A multisig label does not show the threshold or modules.</p>
      )}
    </section>
  );
}
