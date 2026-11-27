import { getAddress, isAddress } from "viem";
import { ClmmPositionsError } from "./errors";

export function normalizeClmmAddress(value: string): string {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new ClmmPositionsError("invalid_request", "Invalid EVM address.");
  }
  return getAddress(trimmed);
}
