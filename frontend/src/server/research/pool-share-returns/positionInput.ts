import type { PoolReturnsRequest } from "./schema";

export type ValidatedInput = {
  account: string;
  poolId: string;
  network: "stellar-testnet" | "stellar-pubnet";
  windowStart: number;
  windowEnd: number;
};

export function validatePositionInput(input: PoolReturnsRequest): ValidatedInput {
  if (input.windowEnd < input.windowStart) {
    throw new Error("Window end must be after window start");
  }

  return {
    account: input.account.trim(),
    poolId: input.poolId.trim(),
    network: input.network,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  };
}
