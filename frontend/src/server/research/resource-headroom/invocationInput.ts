import { ResourceHeadroomError } from "./errors";
import type { ResourceHeadroomRequest } from "./schema";

export function validateInvocationInput(input: ResourceHeadroomRequest): void {
  if (input.mode === "simulation") {
    if (!input.contractId || !/^C[A-Z2-7]{55}$/.test(input.contractId)) {
      throw new ResourceHeadroomError(
        "Simulation mode requires a valid Soroban contract ID (C...)",
        "invalid_request",
        false,
      );
    }
    if (!input.functionName || input.functionName.trim().length === 0) {
      throw new ResourceHeadroomError(
        "Simulation mode requires a non-empty functionName",
        "invalid_request",
        false,
      );
    }
  } else {
    if (!input.txHash || !/^[0-9a-fA-F]{64}$/.test(input.txHash)) {
      throw new ResourceHeadroomError(
        "Historical mode requires a 64-character hex transaction hash",
        "invalid_request",
        false,
      );
    }
  }
}
