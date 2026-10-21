"use client";

import type { BucketResult } from "@/server/research/score-calibration/schema";

export function BucketDetail({ bucket }: { bucket: BucketResult }) {
  return (
    <li className="flex flex-col gap-1 border-b border-white/5 pb-3 last:border-none last:pb-0">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono font-semibold">{bucket.bucket.label}</span>
        {!bucket.sufficientSample && bucket.sampleSize > 0 ? (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-200">insufficient sample</span>
        ) : null}
      </div>
      <p className="text-xs text-subtle">
        {bucket.sampleSize} snapshot{bucket.sampleSize === 1 ? "" : "s"} included
        {bucket.observedRate !== null ? `, ${(bucket.observedRate * 100).toFixed(1)}% observed the outcome` : ""}
        {bucket.confidenceInterval ? ` (95% interval ${(bucket.confidenceInterval.low * 100).toFixed(1)}%–${(bucket.confidenceInterval.high * 100).toFixed(1)}%)` : ""}.
      </p>
    </li>
  );
}
