import type { DiscoveryCoverage } from "./schema";

export function buildCoverage(input: Omit<DiscoveryCoverage, "state" | "message">): DiscoveryCoverage {
  const unavailable = input.snapshotBlock === null || (input.candidateCount > 0 && input.successfulReads === 0);
  const partial = !input.logCoverageComplete || input.skippedCalls > 0 || input.reorgDetected || input.providerLimitations.length > 0;
  const state = unavailable ? "unavailable" : partial ? "partial" : "complete";
  const message = state === "complete"
    ? "All discovered and supplied candidates were read at one confirmed snapshot block. Discovery is limited to the displayed range."
    : state === "partial"
      ? "Results are usable but incomplete. Do not treat this inventory as an all-clear."
      : "The provider could not produce a reliable current allowance inventory. Retry later.";
  return { ...input, state, message };
}
