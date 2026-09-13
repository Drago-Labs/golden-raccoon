export function ledgerCloseEpoch(closeTime: string): bigint {
  const milliseconds = Date.parse(closeTime);
  if (!Number.isFinite(milliseconds)) throw new Error("Ledger close time unavailable");
  return BigInt(Math.floor(milliseconds / 1000));
}
