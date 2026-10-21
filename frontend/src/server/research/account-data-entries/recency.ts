export function isRecentChange(changeLedger: number | null, observationLedger: number | null, windowLedgers: number): boolean {
  if (changeLedger === null || observationLedger === null) return false;
  return changeLedger >= observationLedger - windowLedgers;
}

export function formatDidChange(previous: string | null, next: string | null): boolean {
  return previous !== null && next !== null && previous !== next;
}
