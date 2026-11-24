import { StrKey } from "@stellar/stellar-sdk";
import { CounterpartyFlowsError } from "./errors";
import type { CounterpartyFlowRequest, StellarNetwork } from "./schema";

export type ValidatedAccountInput = {
  account: string;
  network: StellarNetwork;
};

/** Validates the account id after schema parsing. Rejects non-G keys. */
export function validateAccountInput(input: CounterpartyFlowRequest): ValidatedAccountInput {
  const account = input.account.trim();
  if (!StrKey.isValidEd25519PublicKey(account)) {
    throw new CounterpartyFlowsError("invalid_request", "Account must be a valid Stellar public key.");
  }
  return { account, network: input.network };
}
