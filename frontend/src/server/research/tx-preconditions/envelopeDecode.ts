import { FeeBumpTransaction, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { TxPreconditionsError } from "./errors";
import { unwrapFeeBump, type UnwrappedEnvelope } from "./feeBumpUnwrap";
import { expectedPassphrase, type StellarNetwork } from "./schema";

export type DecodedPreconditions = {
  minTime: string | null;
  maxTime: string | null;
  minLedger: number | null;
  maxLedger: number | null;
  minAccountSequence: string | null;
  minAccountSequenceAge: string | null;
  minAccountSequenceLedgerGap: number | null;
  extraSigners: unknown[];
};

export type DecodedEnvelope = UnwrappedEnvelope & {
  sourceAccount: string;
  sequence: string;
  signatureCount: number;
  preconditions: DecodedPreconditions;
  networkPassphrase: string;
};

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

/** Extract CAP-21 precondition fields from an already-unwrapped inner transaction. */
export function readPreconditions(inner: Transaction): DecodedPreconditions {
  const time = inner.timeBounds ?? null;
  const ledger = inner.ledgerBounds ?? null;

  return {
    minTime: asString(time?.minTime),
    maxTime: asString(time?.maxTime),
    minLedger: asNumber(ledger?.minLedger),
    maxLedger: asNumber(ledger?.maxLedger),
    minAccountSequence: asString(inner.minAccountSequence),
    minAccountSequenceAge: inner.minAccountSequenceAge === undefined || inner.minAccountSequenceAge === null
      ? null
      : String(inner.minAccountSequenceAge),
    minAccountSequenceLedgerGap:
      inner.minAccountSequenceLedgerGap === undefined || inner.minAccountSequenceLedgerGap === null
        ? null
        : Number(inner.minAccountSequenceLedgerGap),
    extraSigners: Array.isArray(inner.extraSigners) ? [...inner.extraSigners] : [],
  };
}

/**
 * Decode a pasted transaction envelope XDR, including fee-bump wrappers.
 * The passphrase is only used to construct the SDK object; this feature never signs.
 */
export function decodeEnvelope(envelopeXdr: string, network: StellarNetwork, passphrase?: string): DecodedEnvelope {
  const networkPassphrase = passphrase ?? expectedPassphrase(network);
  let parsed: Transaction | FeeBumpTransaction;

  try {
    parsed = TransactionBuilder.fromXDR(envelopeXdr, networkPassphrase);
  } catch (error) {
    throw new TxPreconditionsError(
      "invalid_xdr",
      "The transaction envelope could not be decoded as XDR.",
      { reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" },
    );
  }

  const unwrapped = unwrapFeeBump(parsed);
  const preconditions = readPreconditions(unwrapped.inner);

  return {
    ...unwrapped,
    sourceAccount: unwrapped.inner.source,
    sequence: unwrapped.inner.sequence,
    signatureCount: unwrapped.inner.signatures.length + unwrapped.outerSignatureCount,
    preconditions,
    networkPassphrase,
  };
}
