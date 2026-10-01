"use client";

import { useState, type FormEvent } from "react";

type Report = {
  status: string;
  explanation: string;
  metadata: { compiler: string | null; optimizer: boolean | null; metadataHash: string | null } | null;
  bytecode: { masked: boolean; equalAfterMask: boolean | null };
  constructorArgs: string | null;
  libraries: { name: string; address: string }[];
  coverage: string;
};

export function SourceBytecodeWorkspace() {
  const [address, setAddress] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/insights/source-bytecode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, blockNumber: 1, bytecode: null, source: null }),
    });
    const payload = (await response.json()) as { report?: Report; message?: string };
    if (!response.ok || !payload.report) {
      setReport(null);
      setError(payload.message ?? "The address could not be checked.");
      return;
    }
    setReport(payload.report);
  }

  return (
    <section className="flex flex-col gap-6">
      <form aria-label="Verified bytecode lookup" onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="text-sm" htmlFor="source-bytecode-address">
          Contract address
        </label>
        <input
          id="source-bytecode-address"
          className="rounded border px-3 py-2"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
        <button className="w-fit rounded border px-3 py-2" type="submit">
          Compare bytecode
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {report ? (
        <article data-testid="source-bytecode-report" className="flex flex-col gap-3">
          <h2>Match summary</h2>
          <p data-testid="match-status">Status: {report.status}. {report.explanation}</p>
          <h2>Metadata</h2>
          <p>
            Compiler {report.metadata?.compiler ?? "unknown"}, optimizer{" "}
            {report.metadata ? String(report.metadata.optimizer) : "unknown"}, metadata hash{" "}
            {report.metadata?.metadataHash ?? "unknown"}.
          </p>
          <h2>Bytecode diff summary</h2>
          <p>
            Immutable references {report.bytecode.masked ? "were masked" : "were not present"}. Equality after masking:{" "}
            {String(report.bytecode.equalAfterMask)}.
          </p>
          <p>Constructor arguments: {report.constructorArgs ?? "not published"}.</p>
          <p>Libraries: {report.libraries.map((item) => `${item.name} ${item.address}`).join(", ") || "none"}.</p>
          <p data-testid="coverage-notice">{report.coverage}</p>
        </article>
      ) : (
        <p data-testid="source-bytecode-idle">No comparison yet. A verified badge can still hide a partial match.</p>
      )}
    </section>
  );
}
