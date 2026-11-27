import { WasmSourceMetaError } from "./errors";
import type { WasmSourceMetaRequest } from "./schema";

/** Stellar contract IDs are StrKey C-prefixed values (56 chars). */
const CONTRACT_ID = /^C[A-Z2-7]{55}$/;

export function validateContractInput(request: WasmSourceMetaRequest): WasmSourceMetaRequest {
  const contractId = request.contractId.trim().toUpperCase();
  if (!CONTRACT_ID.test(contractId)) {
    throw new WasmSourceMetaError(
      "invalid_contract",
      "Contract ID must be a C-prefixed Stellar contract address.",
    );
  }
  return { ...request, contractId };
}
