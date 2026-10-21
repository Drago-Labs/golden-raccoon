"use client";

import type { BucketResult } from "@/server/research/score-calibration/schema";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

/** A simple bar chart, with a text table as a fully equivalent alternative — never the only way to read the data. */
export function CalibrationChart({ buckets }: { buckets: BucketResult[] }) {
  return (
    <section data-testid="calibration-chart" className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-muted">Observed outcome rate by score bucket</h2>

      <div aria-hidden="true" className="flex items-end gap-3 px-1">
        {buckets.map((bucket) => (
          <div key={bucket.bucket.label} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-24 w-full items-end rounded bg-black/20">
              <div
                className={`w-full rounded ${bucket.sufficientSample ? "bg-[#d9a441]" : "bg-[#d9a441]/30"}`}
                style={{ height: `${Math.round((bucket.observedRate ?? 0) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-subtle">{bucket.bucket.label}</span>
          </div>
        ))}
      </div>

      <table className="w-full text-left text-xs">
        <caption className="sr-only">Observed outcome rate, sample size, and confidence interval for each score bucket</caption>
        <thead>
          <tr className="text-subtle">
            <th scope="col" className="py-1 pr-3">
              Score bucket
            </th>
            <th scope="col" className="py-1 pr-3">
              Sample size
            </th>
            <th scope="col" className="py-1 pr-3">
              Outcome rate
            </th>
            <th scope="col" className="py-1 pr-3">
              95% interval
            </th>
            <th scope="col" className="py-1">
              Sufficient sample
            </th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.bucket.label} className="border-t border-white/5">
              <td className="py-1.5 pr-3 font-mono">{bucket.bucket.label}</td>
              <td className="py-1.5 pr-3">{bucket.sampleSize}</td>
              <td className="py-1.5 pr-3">{formatPercent(bucket.observedRate)}</td>
              <td className="py-1.5 pr-3">{bucket.confidenceInterval ? `${formatPercent(bucket.confidenceInterval.low)} – ${formatPercent(bucket.confidenceInterval.high)}` : "—"}</td>
              <td className="py-1.5">{bucket.sufficientSample ? "yes" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
