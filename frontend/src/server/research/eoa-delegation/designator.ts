import { getAddress } from "viem";
export const EIP7702_PREFIX = "0xef0100";
export function decodeDelegationDesignator(code: string): string | null {
  if (!/^0xef0100[0-9a-fA-F]{40}$/.test(code)) return null;
  return getAddress(`0x${code.slice(EIP7702_PREFIX.length)}`);
}
