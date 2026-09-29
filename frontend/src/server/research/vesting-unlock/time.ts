/**
 * Observation clock helpers.
 *
 * Vesting state classification uses one clock: the ledger close time when the
 * reader supplies one, otherwise the wall clock the reader reported. Display
 * conversion to an IANA zone is a presentation concern and never feeds back
 * into classification arithmetic.
 */
export function toEpochMs(value: string | null | undefined): number | null {
  if (!value) return null;

  const ms = Date.parse(value);

  return Number.isFinite(ms) ? ms : null;
}

export function ledgerCloseEpochSeconds(closeTime: string): bigint {
  const milliseconds = Date.parse(closeTime);

  if (!Number.isFinite(milliseconds)) {
    throw new Error("Ledger close time unavailable");
  }

  return BigInt(Math.floor(milliseconds / 1000));
}

/**
 * Formats an ISO instant into the requested IANA zone for display labels.
 *
 * Returns the UTC string unchanged when the zone is invalid, so a bad zone
 * never invents a different unlock time for classification.
 */
export function formatInTimeZone(isoUtc: string, timeZone: string): string {
  const ms = Date.parse(isoUtc);

  if (!Number.isFinite(ms)) return isoUtc;

  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(new Date(ms));
  } catch {
    return isoUtc;
  }
}

export function isObservationStale(options: {
  closeTime: string | null;
  observedAt: string;
  maxAgeSeconds: number;
  nowMs?: number;
}): boolean {
  const closeMs = toEpochMs(options.closeTime);
  const observedMs = toEpochMs(options.observedAt) ?? options.nowMs ?? Date.now();

  if (closeMs === null) return false;

  return observedMs - closeMs > options.maxAgeSeconds * 1_000;
}
