import { StrKey } from "@stellar/stellar-sdk";
import { Sep41ConformanceError } from "./errors";
import { sep41ConformanceRequestSchema, type Sep41ConformanceRequest } from "./schema";

export type ParsedContractInput = {
  contractId: string;
  network: Sep41ConformanceRequest["network"];
  balanceId: string | undefined;
};

/**
 * Validates the caller-supplied contract id and optional balance probe address.
 * Rejects anything that is not a Stellar contract (C…) id.
 */
export function parseContractInput(body: unknown): ParsedContractInput {
  const parsed = sep41ConformanceRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new Sep41ConformanceError(
      "invalid_request",
      parsed.error.errors[0]?.message ?? "Invalid SEP-41 conformance request",
      parsed.error.flatten(),
    );
  }

  const contractId = parsed.data.contractId.trim();
  if (!StrKey.isValidContract(contractId)) {
    throw new Sep41ConformanceError("invalid_contract", "Expected a valid Soroban contract id (C…)");
  }

  const balanceId = parsed.data.balanceId?.trim();
  if (balanceId) {
    const okAccount = StrKey.isValidEd25519PublicKey(balanceId);
    const okContract = StrKey.isValidContract(balanceId);
    if (!okAccount && !okContract) {
      throw new Sep41ConformanceError(
        "invalid_request",
        "balanceId must be a Stellar account (G…) or contract (C…) address",
      );
    }
  }

  return {
    contractId,
    network: parsed.data.network,
    balanceId: balanceId || undefined,
  };
}
