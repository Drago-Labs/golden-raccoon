import type { CounterpartyState } from "./errors";

export function coverageNotice(
  state: CounterpartyState,
  eventCount: number,
  truncated: boolean,
  reachedWindowStart: boolean,
): string {
  if (state === "unavailable") {
    return "Payment history was unavailable. No counterparties or volumes were invented.";
  }
  if (state === "partial") {
    const parts = [
      `Profiled ${eventCount} payment-related events.`,
      truncated ? "History pages were truncated at the feature limit." : null,
      !reachedWindowStart ? "The reader did not reach the start of the requested window." : null,
      "Partial coverage is reported rather than completed.",
    ].filter(Boolean);
    return parts.join(" ");
  }
  return `Complete coverage of ${eventCount} payment, path-payment, and claim events in the window. Labels come only from the known identity directory.`;
}
