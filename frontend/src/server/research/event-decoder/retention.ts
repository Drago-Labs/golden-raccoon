import type { RetentionAssessment } from "./schema";

/**
 * Evaluates whether the requested ledger window falls partially or wholly outside
 * the RPC node's event retention window. Unretained ledgers are explicitly reported
 * as unavailable rather than treated as having zero events.
 */
export function assessRetentionWindow(input: {
  startLedger: number;
  endLedger: number;
  earliestRetainedLedger: number;
  latestLedger: number;
}): RetentionAssessment {
  const { startLedger, endLedger, earliestRetainedLedger, latestLedger } = input;
  const outsideRetention = startLedger < earliestRetainedLedger;
  const unretainedLedgerCount = outsideRetention
    ? Math.min(endLedger, earliestRetainedLedger - 1) - startLedger + 1
    : 0;

  return {
    requestedStartLedger: startLedger,
    requestedEndLedger: endLedger,
    earliestRetainedLedger,
    latestLedger,
    outsideRetention,
    unretainedLedgerCount: Math.max(0, unretainedLedgerCount),
    statusMessage: outsideRetention
      ? `Ledgers ${startLedger}..${Math.min(endLedger, earliestRetainedLedger - 1)} are outside RPC retention (earliest retained: ${earliestRetainedLedger}) and are unavailable, not empty.`
      : `Full ledger range ${startLedger}..${endLedger} is within the RPC retention window.`,
  };
}
