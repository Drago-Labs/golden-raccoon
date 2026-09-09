export const DEFAULT_MAX_LEDGER_LAG = 3;

export type FreshnessEvaluation = {
  highestLedger?: number;
  highestObservedLedger?: number;
  ledgerHeight?: number;
  lag?: number;
  isStale: boolean;
};

/**
 * Finds the highest numerical ledger height among a set of observed heights or endpoint objects.
 *
 * @param items Array of observed ledger heights or endpoint objects
 * @returns The maximum observed ledger height, or undefined if no valid heights exist
 */
export function findHighestLedger(
  items: Array<number | { ledgerHeight?: number } | undefined | null>,
): number | undefined {
  const valid = items
    .map((item) => (typeof item === "object" && item !== null ? item.ledgerHeight : item))
    .filter((h): h is number => typeof h === "number" && Number.isFinite(h) && h >= 0);
  if (valid.length === 0) return undefined;
  return Math.max(...valid);
}

/**
 * Calculates the ledger lag between an endpoint ledger height and the highest observed network ledger.
 *
 * @param endpointLedger The ledger height reported by the specific endpoint
 * @param highestLedger The highest ledger height observed across all network endpoints
 * @returns The non-negative ledger difference, or undefined if either value is missing
 */
export function calculateLedgerLag(
  endpointLedger?: number,
  highestLedger?: number,
): number | undefined {
  if (typeof endpointLedger !== "number" || typeof highestLedger !== "number") {
    return undefined;
  }
  return Math.max(0, highestLedger - endpointLedger);
}

/**
 * Determines whether a given ledger lag constitutes a stale response.
 *
 * @param lag The difference between network head and endpoint ledger
 * @param maxLag Maximum acceptable ledger lag threshold (defaults to DEFAULT_MAX_LEDGER_LAG)
 * @returns True if the lag exceeds the threshold
 */
export function isLedgerStale(
  lag: number | undefined,
  maxLag: number = DEFAULT_MAX_LEDGER_LAG,
): boolean {
  if (lag === undefined) return false;
  return lag > maxLag;
}

/**
 * Evaluates ledger freshness for an endpoint against network head.
 *
 * @param endpointLedger Ledger height reported by the endpoint
 * @param highestLedger Highest observed ledger across all endpoints
 * @param maxLag Maximum acceptable ledger lag threshold
 * @returns Complete freshness evaluation including calculated lag and staleness flag
 */
export function evaluateFreshness(
  endpointLedger?: number,
  highestLedger?: number,
  maxLag: number = DEFAULT_MAX_LEDGER_LAG,
): FreshnessEvaluation {
  const effectiveHighest = findHighestLedger([endpointLedger, highestLedger]);
  const lag = calculateLedgerLag(endpointLedger, effectiveHighest);
  const isStale = isLedgerStale(lag, maxLag);

  return {
    highestLedger: effectiveHighest,
    highestObservedLedger: effectiveHighest,
    ledgerHeight: endpointLedger,
    lag,
    isStale,
  };
}
