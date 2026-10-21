import type { EntryState } from "./errors";

export function coverageNotice(state: EntryState, oldestLedger: number | null): string {
  if (state === "unavailable") {
    return "The account record was unavailable. No entries were invented.";
  }
  if (state === "partial") {
    const reached = oldestLedger === null ? "The oldest fetched ledger was not recorded." : `Oldest ledger reached: ${oldestLedger}.`;
    return `History is partial. ${reached} Entries outside the fetched pages are not guessed.`;
  }
  return "Current data entries and the fetched manage_data history were both available. Nothing was written.";
}
