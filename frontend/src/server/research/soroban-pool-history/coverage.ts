import type { PoolHistoryState } from "./errors";
import type { CoverageGap, DriftReport } from "./schema";

/** Human-readable coverage notice for the workbench. */
export function coverageNotice(
  state: PoolHistoryState,
  gaps: CoverageGap[],
  truncated: boolean,
): string {
  if (state === "unavailable") {
    return "Pool event history is currently unavailable. Please try again later.";
  }
  if (state === "unsupported") {
    const topics = gaps
      .filter((gap) => gap.reason === "unknown_layout")
      .map((gap) => `unknown layout between ledgers ${gap.fromLedger}-${gap.toLedger}`);
    return `Unsupported event layouts: ${topics.join("; ") || "one or more events could not be parsed"}.`;
  }
  if (state === "partial") {
    const parts: string[] = [];
    if (truncated) parts.push("event history was truncated");
    for (const gap of gaps) {
      if (gap.reason === "missing_storage") parts.push("current storage was missing");
      if (gap.reason === "truncated_history") {
        parts.push(`history gap from ledger ${gap.fromLedger} to ${gap.toLedger}`);
      }
    }
    return `Partial coverage: ${parts.join("; ") || "some data points are missing"}.`;
  }
  return "Complete coverage for the selected ledger range.";
}

/** Human-readable drift notice, or null when storage matched. */
export function driftNotice(drift: DriftReport | null): string | null {
  if (!drift) return null;
  if (drift.storageReserveA === null || drift.storageReserveB === null) {
    return "Current pool storage was not available for comparison.";
  }
  if (drift.matched) {
    return "Rebuilt reserves match current storage.";
  }
  return `Reserve drift detected: deltaA=${drift.deltaA}, deltaB=${drift.deltaB}.`;
}
