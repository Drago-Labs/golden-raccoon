/**
 * Pure amount reconciliation between the burn and the attested fee.
 *
 * The protocol guarantees the minted amount is `amount - feeExecuted`
 * whenever a message is processed, so reconciliation never needs a
 * separate destination-side amount read — it is entirely a function of
 * the two already-decoded numbers.
 */
import type { AmountReconciliation, AttestationStep, BurnStep } from "./schema";

export function reconcileAmount(burn: BurnStep, attestation: AttestationStep): AmountReconciliation {
  if (burn.amountBaseUnits === null) {
    return { state: "unknown", grossAmountBaseUnits: null, feeExecutedBaseUnits: null, netAmountBaseUnits: null, note: "The burned amount could not be read from the source chain." };
  }

  if (attestation.feeExecutedBaseUnits === null) {
    return {
      state: "pending_fee",
      grossAmountBaseUnits: burn.amountBaseUnits,
      feeExecutedBaseUnits: null,
      netAmountBaseUnits: null,
      note: "The destination fee is not set until Circle attests the message; the net amount is not yet known.",
    };
  }

  const gross = BigInt(burn.amountBaseUnits);
  const fee = BigInt(attestation.feeExecutedBaseUnits);

  if (fee > gross) {
    return {
      state: "unknown",
      grossAmountBaseUnits: burn.amountBaseUnits,
      feeExecutedBaseUnits: attestation.feeExecutedBaseUnits,
      netAmountBaseUnits: null,
      note: "The attested fee exceeds the burned amount, which should not happen — treating the net amount as unverifiable.",
    };
  }

  const net = gross - fee;
  return {
    state: "reconciled",
    grossAmountBaseUnits: burn.amountBaseUnits,
    feeExecutedBaseUnits: attestation.feeExecutedBaseUnits,
    netAmountBaseUnits: net.toString(10),
    note: fee > BigInt(0) ? "The net mint amount is the burned amount minus the attested destination fee." : "No destination fee was charged; the full burned amount is minted.",
  };
}
