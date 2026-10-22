export function impliedSupply(totalSupply: string, excluded: string): string {
  const result = BigInt(totalSupply) - BigInt(excluded);
  if (result < 0n) throw new RangeError("Excluded balances exceed total supply.");
  return result.toString();
}
