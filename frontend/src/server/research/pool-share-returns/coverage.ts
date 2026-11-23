import type { CoverageGap } from "./schema";

export function coverageNotice(
  state: "complete" | "partial" | "unavailable",
  gaps: CoverageGap[],
): string {
  if (state === "unavailable") {
    return "Pool data is currently unavailable. Please try again later.";
  }

  if (state === "partial") {
    if (gaps.length === 0) {
      return "Some data points are missing but calculations were completed with available data.";
    }

    const gapDescriptions = gaps.map((gap) => {
      const reason = gap.reason === "missing_reserves" ? "reserve data" : "price data";
      return `${reason} from ledger ${gap.fromLedger} to ${gap.toLedger}`;
    });

    return `Partial coverage: missing ${gapDescriptions.join(", ")}.`;
  }

  return "Complete coverage for the selected window.";
}
