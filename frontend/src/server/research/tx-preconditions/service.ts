/**
 * Assemble a read-only CAP-21 precondition report from a pasted envelope XDR
 * and current ledger state. Readers are injected so tests never hit the network.
 * Nothing is signed or submitted.
 */

import { coverageNotice } from "./coverage";
import { decodeEnvelope } from "./envelopeDecode";
import { TxPreconditionsError, type EvaluationState } from "./errors";
import { evaluateExtraSigners } from "./extraSigners";
import { evaluateLedgerBounds } from "./ledgerBounds";
import {
  readAccountState,
  readCurrentLedger,
  type AccountLedgerState,
  type CurrentLedgerState,
  type ReadOutcome,
} from "./ledgerState";
import {
  TX_PRECONDITIONS_SCHEMA_VERSION,
  txPreconditionsRequestSchema,
  type PreconditionsReport,
  type StellarNetwork,
} from "./schema";
import { evaluateSequenceRules } from "./sequenceRules";
import { evaluateTimeBounds } from "./timeBounds";
import { computeValidityWindow } from "./validityWindow";

export type PreconditionsDeps = {
  readLedger: (network: StellarNetwork) => Promise<ReadOutcome<CurrentLedgerState>>;
  readAccount: (network: StellarNetwork, accountId: string) => Promise<ReadOutcome<AccountLedgerState>>;
};

const productionDeps: PreconditionsDeps = {
  readLedger: (network) => readCurrentLedger(network),
  readAccount: (network, accountId) => readAccountState(network, accountId),
};

function emptyWindow(reasons: string[], currentlyValid = false): PreconditionsReport["validityWindow"] {
  return {
    earliestSubmitAt: null,
    latestSubmitAt: null,
    earliestLedger: null,
    latestLedger: null,
    currentlyValid,
    invalidReasons: reasons,
  };
}

/**
 * Decode envelope preconditions and compare them to the current ledger.
 */
export async function explainTransactionPreconditions(
  input: unknown,
  deps: PreconditionsDeps = productionDeps,
): Promise<PreconditionsReport> {
  const parsed = txPreconditionsRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new TxPreconditionsError("invalid_request", "The precondition request is invalid.", parsed.error.flatten());
  }

  const { envelopeXdr, network, passphrase, evaluatedAt } = parsed.data;
  const decoded = decodeEnvelope(envelopeXdr, network, passphrase);
  const extraSigners = evaluateExtraSigners(decoded.inner, decoded.preconditions.extraSigners);

  const coverageReasons: string[] = [];
  let state: EvaluationState = "complete";

  const ledgerOutcome = await deps.readLedger(network);
  let ledger: CurrentLedgerState | null = null;
  let account: AccountLedgerState | null = null;

  if (ledgerOutcome.status === "unavailable") {
    state = "unavailable";
    coverageReasons.push(ledgerOutcome.reason);
  } else if (ledgerOutcome.status === "missing") {
    state = "unavailable";
    coverageReasons.push("No current ledger was returned.");
  } else {
    ledger = ledgerOutcome.value;
  }

  if (ledger) {
    const accountOutcome = await deps.readAccount(network, decoded.sourceAccount);
    if (accountOutcome.status === "unavailable") {
      state = state === "unavailable" ? "unavailable" : "partial";
      coverageReasons.push(`Account state unavailable: ${accountOutcome.reason}`);
    } else if (accountOutcome.status === "missing") {
      state = state === "unavailable" ? "unavailable" : "partial";
      coverageReasons.push("Source account was not found on the selected network.");
    } else {
      account = accountOutcome.value;
    }
  }

  // Optional evaluatedAt override (tests): prefer request clock for time comparisons when ledger is present.
  let closeTimeUnix = ledger?.closeTimeUnix ?? null;
  let closeTimeIso = ledger?.closeTime ?? null;
  if (evaluatedAt && ledger) {
    const overrideUnix = Math.floor(Date.parse(evaluatedAt) / 1000);
    if (Number.isFinite(overrideUnix)) {
      closeTimeUnix = overrideUnix;
      closeTimeIso = evaluatedAt;
    }
  }

  const timeEval = evaluateTimeBounds(decoded.preconditions, closeTimeUnix);
  const ledgerEval = evaluateLedgerBounds(decoded.preconditions, ledger?.ledger ?? null);
  const sequenceEval = evaluateSequenceRules(
    decoded.preconditions,
    decoded.sequence,
    {
      sequence: account?.sequence ?? null,
      sequenceTimeUnix: account?.sequenceTimeUnix ?? null,
      sequenceLedger: account?.sequenceLedger ?? null,
    },
    closeTimeUnix,
    ledger?.ledger ?? null,
  );

  const preconditions = [...timeEval.rows, ...ledgerEval.rows, ...sequenceEval.rows];

  if (decoded.preconditions.extraSigners.length > 0) {
    const allPresent = extraSigners.every((signer) => signer.signaturePresent);
    preconditions.push({
      name: "extraSigners",
      present: true,
      value: extraSigners.map((signer) => signer.key).join(", "),
      status: allPresent ? "satisfied" : "unsatisfied",
      explanation: allPresent
        ? "Every extra signer has a matching signature hint on the inner envelope."
        : "At least one extra signer is missing a matching signature hint.",
    });
  } else {
    preconditions.push({
      name: "extraSigners",
      present: false,
      value: null,
      status: "not_set",
      explanation: "No extra signers are required.",
    });
  }

  const invalidReasons = [
    ...timeEval.reasons,
    ...ledgerEval.reasons,
    ...sequenceEval.reasons,
    ...extraSigners.filter((signer) => !signer.signaturePresent).map((signer) => `Extra signer ${signer.key} has not signed.`),
  ];

  if (state === "unavailable") {
    // Still return decoded rows; validity against live ledger is not claimed.
    return {
      schemaVersion: TX_PRECONDITIONS_SCHEMA_VERSION,
      network,
      state,
      envelope: {
        isFeeBump: decoded.isFeeBump,
        sourceAccount: decoded.sourceAccount,
        feeSource: decoded.feeSource,
        sequence: decoded.sequence,
        signatureCount: decoded.signatureCount,
      },
      preconditions,
      validityWindow: emptyWindow(["Ledger state unavailable; validity window against the live network is not claimed."]),
      extraSigners,
      ledger: null,
      coverageNotice: coverageNotice("unavailable", coverageReasons),
      readOnly: true,
      signsOrSubmits: false,
    };
  }

  if (coverageReasons.length > 0 || preconditions.some((row) => row.status === "unknown")) {
    state = "partial";
  }

  const currentlySatisfied =
    timeEval.satisfied && ledgerEval.satisfied && sequenceEval.satisfied && extraSigners.every((signer) => signer.canBeSatisfied);

  const validityWindow = computeValidityWindow({
    timeEarliestUnix: timeEval.earliestUnix,
    timeLatestUnix: timeEval.latestUnix,
    ledgerEarliest: ledgerEval.earliestLedger,
    ledgerLatest: ledgerEval.latestLedger,
    sequenceEarliestUnix: sequenceEval.earliestUnix,
    sequenceEarliestLedger: sequenceEval.earliestLedger,
    currentlySatisfied,
    invalidReasons,
  });

  return {
    schemaVersion: TX_PRECONDITIONS_SCHEMA_VERSION,
    network,
    state,
    envelope: {
      isFeeBump: decoded.isFeeBump,
      sourceAccount: decoded.sourceAccount,
      feeSource: decoded.feeSource,
      sequence: decoded.sequence,
      signatureCount: decoded.signatureCount,
    },
    preconditions,
    validityWindow,
    extraSigners,
    ledger: ledger
      ? {
          ledger: ledger.ledger,
          closeTime: closeTimeIso ?? ledger.closeTime,
          accountSequence: account?.sequence ?? null,
          accountSequenceTime:
            account?.sequenceTimeUnix !== null && account?.sequenceTimeUnix !== undefined
              ? new Date(account.sequenceTimeUnix * 1000).toISOString()
              : null,
          accountSequenceLedger: account?.sequenceLedger ?? null,
        }
      : null,
    coverageNotice: coverageNotice(state, coverageReasons),
    readOnly: true,
    signsOrSubmits: false,
  };
}
