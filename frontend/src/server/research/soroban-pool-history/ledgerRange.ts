import { PoolHistoryError } from "./errors";
import { POOL_HISTORY_LIMITS } from "./limits";

export type LedgerRange = {
  fromLedger: number;
  toLedger: number;
};

/** Clamp and validate an inclusive ledger window against feature limits. */
export function normalizeLedgerRange(fromLedger: number, toLedger: number): LedgerRange {
  if (!Number.isInteger(fromLedger) || !Number.isInteger(toLedger) || fromLedger < 1 || toLedger < 1) {
    throw new PoolHistoryError("invalid_request", "Ledger bounds must be positive integers.");
  }
  if (toLedger < fromLedger) {
    throw new PoolHistoryError("invalid_request", "The window end is before the start.");
  }
  if (toLedger - fromLedger > POOL_HISTORY_LIMITS.maxLedgerWindow) {
    throw new PoolHistoryError("invalid_request", "The ledger window is too wide.");
  }
  return { fromLedger, toLedger };
}

/** True when a ledger falls inside an inclusive range. */
export function ledgerInRange(ledger: number, range: LedgerRange): boolean {
  return ledger >= range.fromLedger && ledger <= range.toLedger;
}
