import { getAddress, isAddress } from "viem"; export function normalizeProtocolAddress(value: string) { if (!isAddress(value)) throw new Error("Invalid protocol address"); return getAddress(value); }
