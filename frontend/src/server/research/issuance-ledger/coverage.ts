import type { IssuanceLedgerState } from "./errors";

export function coverageNotice(
  state: IssuanceLedgerState,
  reconciled: boolean,
  oldestLedger: number | null,
  truncated: boolean,
): string {
  if (state === "unavailable") {
    return "Issuer operations or network supply were unavailable. No supply figure was invented.";
  }
  if (state === "partial" || truncated) {
    const reached = oldestLedger === null ? "The oldest fetched ledger was not recorded." : `Oldest ledger reached: ${oldestLedger}.`;
    return `Issuance ledger is partial. ${reached} Partial history was not treated as reconciled.`;
  }
  if (!reconciled) {
    return "Reconstructed supply does not equal the network-reported amount at one or more checkpoints. Differences list the surrounding operations.";
  }
  return "Running supply matches the network-reported amount at every checkpoint. Classification rules are documented; no prices were converted.";
}
