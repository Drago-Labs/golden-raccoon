import { getAddress, isAddress } from "viem";
export function normalizeEoaAddress(value: string): string {
  if (!isAddress(value)) throw new Error("Invalid EVM address");
  return getAddress(value);
}
