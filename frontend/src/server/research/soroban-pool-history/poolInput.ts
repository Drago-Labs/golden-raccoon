import { StrKey } from "@stellar/stellar-sdk";
import { PoolHistoryError } from "./errors";
import type { PoolHistoryRequest, StellarNetwork } from "./schema";

export type ValidatedPoolInput = {
  poolId: string;
  network: StellarNetwork;
  fromLedger: number;
  toLedger: number;
};

/** Normalize and validate a pool contract id plus ledger window. */
export function validatePoolInput(input: PoolHistoryRequest): ValidatedPoolInput {
  const poolId = input.poolId.trim().toUpperCase();
  if (!StrKey.isValidContract(poolId)) {
    throw new PoolHistoryError("invalid_request", "Expected a Soroban pool contract id.");
  }
  if (input.toLedger < input.fromLedger) {
    throw new PoolHistoryError("invalid_request", "The window end is before the start.");
  }
  return {
    poolId,
    network: input.network,
    fromLedger: input.fromLedger,
    toLedger: input.toLedger,
  };
}
