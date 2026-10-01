/**
 * Hand-picked selectors for the read-only calls this feature needs.
 * Verified against `keccak256(signature)` rather than copied from memory.
 */
export const SELECTORS = {
  name: "0x06fdde03",
  domainSeparator: "0x3644e515",
  nonces: "0x7ecebe00",
  version: "0x54fd4d50",
  /** Permit2's `allowance(owner, token, spender)`. */
  permit2Allowance: "0x927da105",
} as const;

/** Canonical Permit2 deployment address, identical across every chain it is deployed on. */
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA";

export function encodeAddressArg(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function encodeNonces(owner: string): string {
  return SELECTORS.nonces + encodeAddressArg(owner);
}

export function encodePermit2Allowance(owner: string, token: string, spender: string): string {
  return SELECTORS.permit2Allowance + encodeAddressArg(owner) + encodeAddressArg(token) + encodeAddressArg(spender);
}

export function decodeUint(word: string | null): bigint | null {
  if (!word) return null;
  try {
    return BigInt(word);
  } catch {
    return null;
  }
}

/** Decodes a standard ABI-encoded `string` return value: 32-byte offset, 32-byte length, then UTF-8 bytes. */
export function decodeString(data: string | null): string | null {
  if (!data) return null;
  const body = data.replace(/^0x/, "");
  if (body.length < 128) return null;
  const lengthWord = body.slice(64, 128);
  const length = Number(BigInt(`0x${lengthWord}`));
  if (!Number.isFinite(length) || length < 0 || length > 1024) return null;
  const contentHex = body.slice(128, 128 + length * 2);
  if (contentHex.length !== length * 2) return null;
  try {
    return Buffer.from(contentHex, "hex").toString("utf8");
  } catch {
    return null;
  }
}

/** Permit2's `allowance` returns `(uint160 amount, uint48 expiration, uint48 nonce)` packed as three 32-byte words. */
export function decodePermit2Allowance(data: string | null): { amount: bigint; expiration: number; nonce: number } | null {
  if (!data) return null;
  const body = data.replace(/^0x/, "");
  if (body.length < 192) return null;
  const amount = BigInt(`0x${body.slice(0, 64)}`);
  const expiration = Number(BigInt(`0x${body.slice(64, 128)}`));
  const nonce = Number(BigInt(`0x${body.slice(128, 192)}`));
  return { amount, expiration, nonce };
}
