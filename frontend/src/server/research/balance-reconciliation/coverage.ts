import type { ReconciliationState } from "./errors";

export function coverageNotice(state: ReconciliationState, matched: boolean, oldestLedger: number | null): string {
  if (state === "unavailable") return "The account history was unavailable. No balance was invented.";
  if (state === "partial") {
    const reached = oldestLedger === null ? "The oldest fetched ledger was not recorded." : `Oldest ledger reached: ${oldestLedger}.`;
    return `Reconciliation is partial. ${reached} Partial history was not treated as a match.`;
  }
  if (!matched) return "The recorded end balance does not equal the reconstructed balance. The difference is an unexplained delta, not a match.";
  return "The reconstructed balances match the recorded end balances to the stroop. No prices were converted.";
}
