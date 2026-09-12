"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ActivityBucket } from "@/server/research/social-coordination/schema";

/**
 * Observation volume by time window.
 *
 * A table rather than a chart: the multiple-of-median figure is the whole
 * signal, and it reads better as a number than as a bar a reader has to
 * estimate. Undated observations do not appear here at all, which the sampling
 * notice explains.
 */
export function ActivityTimeline({ buckets, bucketSeconds }: { buckets: ActivityBucket[]; bucketSeconds: number }) {
  if (buckets.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No observation carried a readable timestamp, so there is no timeline to show.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Observation volume in {bucketSeconds}-second windows, compared against the median window.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Window starts</th>
            <th scope="col" className="py-2 pr-3">Observations</th>
            <th scope="col" className="py-2 pr-3">Distinct authors</th>
            <th scope="col" className="py-2 pr-3">vs median</th>
            <th scope="col" className="py-2 pr-3">Flagged</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.startsAt} className="border-b border-white/5 align-top">
              <th scope="row" className="py-2 pr-3 font-mono text-xs font-medium">{bucket.startsAt}</th>
              <td className="py-2 pr-3 text-xs tabular-nums">{bucket.observationCount}</td>
              <td className="py-2 pr-3 text-xs tabular-nums">{bucket.distinctAuthorCount}</td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {bucket.multipleOfMedian === null ? <span className="text-subtle">Not derivable</span> : `${bucket.multipleOfMedian}x`}
              </td>
              <td className="py-2 pr-3 text-xs">
                {bucket.isBurst ? (
                  <StatusBadge tone="warning">Above threshold</StatusBadge>
                ) : (
                  <span className="text-subtle">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
