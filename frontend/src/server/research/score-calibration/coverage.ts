/** Pure summary of how much of the read history this report could use. */
import type { BucketResult, CoverageState, ExcludedSnapshot } from "./schema";

export function summarizeCoverage(totalRead: number, totalIncluded: number, excluded: ExcludedSnapshot[], buckets: BucketResult[]): { state: CoverageState; note: string } {
  if (totalRead === 0) {
    return { state: "empty", note: "No historical score snapshots were found for this network." };
  }
  if (totalIncluded === 0) {
    const reason = excluded[0]?.reason ?? "horizon_not_elapsed";
    return { state: "unavailable", note: reason === "horizon_not_elapsed" ? "Every snapshot's horizon window is still open." : "No snapshot could be checked for this outcome." };
  }

  const anySufficient = buckets.some((bucket) => bucket.sampleSize > 0 && bucket.sufficientSample);
  if (!anySufficient) {
    return { state: "partial", note: "Snapshots were included, but every bucket is below the minimum sample size for a precise rate." };
  }

  if (excluded.length > 0) {
    return { state: "partial", note: `${totalIncluded} of ${totalRead} snapshots were included; the rest were excluded (see excludedSnapshots).` };
  }

  return { state: "complete", note: "All read snapshots had an elapsed horizon and a checkable outcome." };
}
