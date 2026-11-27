import type { DriftReport } from "./schema";

/** Compare rebuilt reserves with current pool storage and report any drift. */
export function checkStorageDrift(
  rebuiltReserveA: bigint,
  rebuiltReserveB: bigint,
  storageReserveA: bigint | null,
  storageReserveB: bigint | null,
): DriftReport {
  if (storageReserveA === null || storageReserveB === null) {
    return {
      matched: false,
      rebuiltReserveA: rebuiltReserveA.toString(),
      rebuiltReserveB: rebuiltReserveB.toString(),
      storageReserveA: storageReserveA?.toString() ?? null,
      storageReserveB: storageReserveB?.toString() ?? null,
      deltaA: null,
      deltaB: null,
    };
  }

  const deltaA = rebuiltReserveA - storageReserveA;
  const deltaB = rebuiltReserveB - storageReserveB;
  return {
    matched: deltaA === 0n && deltaB === 0n,
    rebuiltReserveA: rebuiltReserveA.toString(),
    rebuiltReserveB: rebuiltReserveB.toString(),
    storageReserveA: storageReserveA.toString(),
    storageReserveB: storageReserveB.toString(),
    deltaA: deltaA.toString(),
    deltaB: deltaB.toString(),
  };
}
