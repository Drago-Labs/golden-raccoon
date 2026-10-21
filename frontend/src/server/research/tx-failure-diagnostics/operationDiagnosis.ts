import type { OperationDiagnosis, OperationOutcome } from "./schema";
import { explainOperationCode, isTransactionLevelCode } from "./resultCodes";
import type { DecodedEnvelopeOperation, DecodedOperationResult } from "./xdrDecoder";

function outcomeExplanation(
  outcome: OperationOutcome,
  resultCode: string | null,
  transactionCode: string,
  sawOperationFailure: boolean,
): string {
  if (outcome === "would_succeed_alone") {
    if (!sawOperationFailure) return explainOperationCode(resultCode ?? "op_success");
    return "This operation succeeded. It would have succeeded on its own. The later failure aborted the transaction before it was applied.";
  }
  if (outcome === "aborted_transaction") {
    return `${explainOperationCode(resultCode ?? "unknown")} This is the operation that aborted the transaction.`;
  }
  if (isTransactionLevelCode(transactionCode)) {
    return `This operation was not attempted. The transaction failed before operations: ${transactionCode}.`;
  }
  return "This operation was not attempted. An earlier operation already aborted the transaction.";
}

/**
 * Pair envelope operations with result codes.
 *
 * A successful code before the first failure would have succeeded alone.
 * The first failing code aborted the transaction.
 * Envelope operations with no result code were not attempted.
 */
export function diagnoseOperations(
  envelopeOperations: DecodedEnvelopeOperation[],
  resultOperations: DecodedOperationResult[],
  transactionCode: string,
): OperationDiagnosis[] {
  const failureIndex = isTransactionLevelCode(transactionCode)
    ? -1
    : resultOperations.findIndex((operation) => operation.resultCode !== "op_success");

  return envelopeOperations.map((operation) => {
    const result = resultOperations[operation.index];
    let outcome: OperationOutcome;
    if (isTransactionLevelCode(transactionCode) || !result) {
      outcome = "not_attempted";
    } else if (failureIndex === -1) {
      outcome = "would_succeed_alone";
    } else if (operation.index < failureIndex) {
      outcome = "would_succeed_alone";
    } else if (operation.index === failureIndex) {
      outcome = "aborted_transaction";
    } else {
      outcome = "not_attempted";
    }

    const resultCode = outcome === "not_attempted" ? null : (result?.resultCode ?? null);
    return {
      index: operation.index,
      type: operation.type,
      resultCode,
      outcome,
      explanation: outcomeExplanation(outcome, resultCode, transactionCode, failureIndex >= 0),
      sourceAccount: operation.sourceAccount,
      destination: operation.destination,
      amountStroops: operation.amountStroops,
    };
  });
}
