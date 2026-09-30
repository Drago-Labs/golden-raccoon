/**
 * Hand-picked 4-byte selectors for the read-only calls this feature needs.
 * No write path exists here, so a minimal manual encoder is clearer than
 * pulling in a full ABI toolchain for four functions.
 */
export const SELECTORS = {
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  totalSupply: "0x18160ddd",
  balanceOf: "0x70a08231",
  getReserves: "0x0902f1ac",
} as const;

export function encodeAddressArg(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function encodeBalanceOf(holder: string): string {
  return SELECTORS.balanceOf + encodeAddressArg(holder);
}

export function decodeAddress(word: string): string {
  const hexValue = word.replace(/^0x/, "").slice(-40);
  return `0x${hexValue}`;
}

export function decodeUint(word: string | null): bigint | null {
  if (!word) return null;
  try {
    return BigInt(word);
  } catch {
    return null;
  }
}

/** `getReserves()` returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) packed as three 32-byte words. */
export function decodeReserves(data: string | null): { reserve0: bigint; reserve1: bigint; blockTimestampLast: number } | null {
  if (!data) return null;
  const body = data.replace(/^0x/, "");
  if (body.length < 192) return null;
  const reserve0 = BigInt(`0x${body.slice(0, 64)}`);
  const reserve1 = BigInt(`0x${body.slice(64, 128)}`);
  const blockTimestampLast = Number(BigInt(`0x${body.slice(128, 192)}`));
  return { reserve0, reserve1, blockTimestampLast };
}
