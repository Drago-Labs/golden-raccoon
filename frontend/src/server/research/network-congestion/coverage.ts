/**
 * What the statistics leave out.
 *
 * Complete means every sequence in the window was read and every included
 * transaction was classified. A gap, a truncated page, or an unclassified
 * fee makes the window partial. An empty window is a successful read of
 * nothing, not a provider failure.
 */
import type { CongestionCoverage, LedgerGap } from "./schema";

export function buildCoverage(input: {
  presentLedgerCount: number;
  gaps: readonly LedgerGap[];
  truncated: boolean;
  omittedTransactionCount: number;
  unsplitCount: number;
}): CongestionCoverage {
  const missingLedgerCount = input.gaps.reduce((sum, gap) => sum + gap.missingCount, 0);
  const shared = {
    presentLedgerCount: input.presentLedgerCount,
    gapCount: input.gaps.length,
    missingLedgerCount,
    truncated: input.truncated,
    omittedTransactionCount: input.omittedTransactionCount,
    unsplitSorobanCount: input.unsplitCount,
  };

  if (input.presentLedgerCount === 0) {
    return {
      ...shared,
      state: "empty",
      note:
        missingLedgerCount > 0
          ? `None of the requested ledgers were present. ${missingLedgerCount} missing ledger(s) are excluded from statistics.`
          : "No ledger was present in this window. This is an empty result, not a zero-fee network.",
    };
  }

  const reasons: string[] = [];

  if (missingLedgerCount > 0) {
    reasons.push(`${missingLedgerCount} missing ledger(s) are excluded from the average, the surge runs, and the percentiles`);
  }

  if (input.truncated) {
    reasons.push("the provider page limit was reached before the window finished");
  }

  if (input.omittedTransactionCount > 0) {
    reasons.push(`${input.omittedTransactionCount} transaction(s) had no classifiable fee and were left out of the percentiles`);
  }

  if (input.unsplitCount > 0) {
    reasons.push(`${input.unsplitCount} Soroban transaction(s) could not be split into inclusion and resource fees, so they were left out of both`);
  }

  if (reasons.length > 0) {
    return {
      ...shared,
      state: "partial",
      note: `Statistics use the ${input.presentLedgerCount} ledger(s) that were present. ${reasons.join("; ")}.`,
    };
  }

  return {
    ...shared,
    state: "complete",
    note: `All ${input.presentLedgerCount} ledger(s) in the window were read, and every included transaction was classified.`,
  };
}
