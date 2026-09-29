import type { ReserveCounters } from "./schema";

export function validateCounters(counters: ReserveCounters): ReserveCounters {
  for (const [name, value] of Object.entries(counters)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
  }
  if (counters.numSponsored > counters.subentryCount + 2) throw new Error("Sponsored entries exceed account and subentry capacity");
  const reserveUnits = 2 + counters.subentryCount + counters.numSponsoring - counters.numSponsored;
  if (reserveUnits < 0) throw new Error("Sponsorship counters produce a negative reserve");
  return counters;
}

export function sponsorshipReserve(input: ReserveCounters, baseReserveStroops: bigint) {
  validateCounters(input);
  return {
    sponsoringReserveStroops: BigInt(input.numSponsoring) * baseReserveStroops,
    sponsoredReserveCreditStroops: BigInt(input.numSponsored) * baseReserveStroops,
  };
}
