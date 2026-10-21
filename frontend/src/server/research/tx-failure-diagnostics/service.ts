import { coverageNotice } from "./coverage";
import { TxFailureDiagnosticsError, type DiagnosisState } from "./errors";
import { splitFeeBump } from "./feeBump";
import { interpretLedgerState, type AccountSnapshot } from "./ledgerState";
import { TX_FAILURE_LIMITS } from "./limits";
import { diagnoseOperations } from "./operationDiagnosis";
import { explainTransactionCode, isTransactionLevelCode } from "./resultCodes";
import {
  TX_FAILURE_SCHEMA_VERSION,
  txFailureRequestSchema,
  type DiagnosisReport,
  type StellarNetwork,
} from "./schema";
import { readAccountSnapshot, readRecordedTransaction, type ReadOutcome, type RecordedTransaction } from "./transactionReader";
import { decodeEnvelopeXdr, decodeResultXdr } from "./xdrDecoder";

export type DiagnosisDeps = {
  readTransaction: (network: StellarNetwork, hash: string) => Promise<ReadOutcome<RecordedTransaction>>;
  readAccount: (network: StellarNetwork, accountId: string, ledger: number) => Promise<ReadOutcome<AccountSnapshot>>;
};

const productionDeps: DiagnosisDeps = {
  readTransaction: readRecordedTransaction,
  readAccount: async (network, accountId) => readAccountSnapshot(network, accountId),
};

function unavailableReport(hash: string, network: StellarNetwork, reason: string): DiagnosisReport {
  return {
    schemaVersion: TX_FAILURE_SCHEMA_VERSION,
    hash,
    network,
    state: "unavailable",
    transactionCode: null,
    transactionExplanation: reason,
    feeChargedStroops: null,
    transactionLevel: false,
    feeBump: null,
    operations: [],
    envelopeOperationCount: 0,
    truncatedOperations: false,
    stateEvidence: [],
    coverageNotice: coverageNotice("unavailable", []),
    readOnly: true,
    signsOrRetries: false,
  };
}

/**
 * Explain a failed transaction from its result XDR and recorded ledger state.
 * Readers are injected so tests never hit the network. Nothing is signed or resubmitted.
 */
export async function diagnoseFailedTransaction(input: unknown, deps: DiagnosisDeps = productionDeps): Promise<DiagnosisReport> {
  const parsed = txFailureRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new TxFailureDiagnosticsError("invalid_request", "The diagnosis request is invalid.", parsed.error.flatten());
  }

  const { hash, network } = parsed.data;
  const transaction = await deps.readTransaction(network, hash.toLowerCase());
  if (transaction.status === "unavailable") return unavailableReport(hash.toLowerCase(), network, transaction.reason);
  if (transaction.status === "missing") {
    throw new TxFailureDiagnosticsError("not_found", "No transaction was recorded for this hash on the selected network.");
  }

  const record = transaction.value;
  const decodedResult = decodeResultXdr(record.resultXdr);
  const envelope = decodeEnvelopeXdr(record.envelopeXdr);
  const feeBump = splitFeeBump(decodedResult);
  const operationCode = feeBump?.innerCode ?? decodedResult.code;
  const reasons: string[] = [];
  let truncatedOperations = false;
  let envelopeOperations = envelope.operations;

  if (envelopeOperations.length > TX_FAILURE_LIMITS.maxOperations) {
    envelopeOperations = envelopeOperations.slice(0, TX_FAILURE_LIMITS.maxOperations);
    truncatedOperations = true;
    reasons.push("The envelope was truncated at the operation limit.");
  }

  if (envelope.operations.length === 0) {
    reasons.push("The envelope did not decode to a supported operation list.");
  }

  const operations = diagnoseOperations(envelopeOperations, decodedResult.operationResults, operationCode);
  const failing = operations.find((operation) => operation.outcome === "aborted_transaction");
  const accounts = [...new Set([envelope.sourceAccount, envelope.feeSource, record.sourceAccount, record.feeSource].filter((value): value is string => Boolean(value)))];
  const lookedUp = accounts.slice(0, TX_FAILURE_LIMITS.maxStateLookups);
  if (accounts.length > lookedUp.length) {
    reasons.push("Some accounts were not loaded because the state lookup limit was reached.");
  }

  const stateEvidence = [];
  for (const account of lookedUp) {
    const snapshot = await deps.readAccount(network, account, record.ledger);
    if (snapshot.status === "unavailable") {
      reasons.push(`Account state for ${account} was unavailable.`);
      stateEvidence.push(interpretLedgerState(account, null, { ledger: record.ledger, envelopeSequence: envelope.sequence, failingAmountStroops: null, failingCode: null }));
      continue;
    }
    const value = snapshot.status === "ok" ? snapshot.value : null;
    if (!value) reasons.push(`Historical state for ${account} is missing.`);
    stateEvidence.push(
      interpretLedgerState(account, value, {
        ledger: record.ledger,
        envelopeSequence: envelope.sequence,
        failingAmountStroops: failing?.amountStroops ?? null,
        failingCode: failing?.resultCode ?? null,
      }),
    );
  }

  if (stateEvidence.some((evidence) => evidence.status !== "historical")) {
    reasons.push("At least one account is missing historical state from the failure ledger.");
  }

  const state: DiagnosisState = reasons.length > 0 || truncatedOperations ? "partial" : "complete";
  const transactionExplanation = feeBump
    ? `${explainTransactionCode(feeBump.outerCode)} Inner result: ${explainTransactionCode(feeBump.innerCode)}`
    : explainTransactionCode(decodedResult.code);

  return {
    schemaVersion: TX_FAILURE_SCHEMA_VERSION,
    hash: hash.toLowerCase(),
    network,
    state,
    transactionCode: decodedResult.code,
    transactionExplanation,
    feeChargedStroops: decodedResult.feeChargedStroops,
    transactionLevel: isTransactionLevelCode(operationCode),
    feeBump,
    operations,
    envelopeOperationCount: envelope.operations.length,
    truncatedOperations,
    stateEvidence,
    coverageNotice: coverageNotice(state, reasons),
    readOnly: true,
    signsOrRetries: false,
  };
}
