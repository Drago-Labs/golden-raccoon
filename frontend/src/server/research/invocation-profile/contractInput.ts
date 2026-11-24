import { StrKey } from "@stellar/stellar-sdk";
import { InvocationProfileError } from "./errors";
import { INVOCATION_PROFILE_LIMITS } from "./limits";
import { invocationProfileRequestSchema, type InvocationProfileRequest } from "./schema";

export type ValidatedContractInput = {
  contractId: string;
  network: InvocationProfileRequest["network"];
  windowStart: number;
  windowEnd: number;
};

export function parseContractInput(body: unknown): ValidatedContractInput {
  const parsed = invocationProfileRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new InvocationProfileError(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid invocation profile request",
      parsed.error.flatten(),
    );
  }

  const contractId = parsed.data.contractId.trim();
  if (!StrKey.isValidContract(contractId)) {
    throw new InvocationProfileError("invalid_contract", "Expected a valid Soroban contract id (C…)");
  }

  const { network, windowStart, windowEnd } = parsed.data;
  if (windowEnd < windowStart) {
    throw new InvocationProfileError("invalid_request", "Window end must be after window start");
  }
  if (windowEnd - windowStart > INVOCATION_PROFILE_LIMITS.maxWindowLedgers) {
    throw new InvocationProfileError("invalid_request", "Window is too large");
  }

  return { contractId, network, windowStart, windowEnd };
}
