import { getAddress, isAddress } from "viem"; export function normalizeLendingAddress(value: string) { if (!isAddress(value)) throw new Error("Invalid EVM address"); return getAddress(value); }
