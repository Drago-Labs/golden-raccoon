/**
 * Stellar transaction envelopes, decoded with the installed SDK.
 *
 * One fact shapes this module: **an envelope does not name a network.** The
 * network only enters at signing time, when the signer hashes the passphrase
 * together with the envelope. So this decoder reports the network context the
 * *caller declared*, computes its hash, and marks the binding as declared
 * rather than observed. Presenting a caller's claim as something read from the
 * payload would be the most dangerous kind of wrong here.
 */
import { FeeBumpTransaction, Transaction, TransactionBuilder, hash } from "@stellar/stellar-sdk";
import { SIGNING_LIMITS, SigningInspectorError, type UnknownField } from "./schema";

export type EnvelopePreconditions = {
  minTime: string | null;
  maxTime: string | null;
  /** True when the caller's evaluation time is past maxTime. */
  expired: boolean;
  ledgerBounds: string | null;
  minAccountSequence: string | null;
};

export type StellarEnvelopeDecoding = {
  /** Source of the inner transaction. For a fee bump, the fee source too. */
  source: string;
  feeBumpSource: string | null;
  isFeeBump: boolean;
  fee: string;
  sequence: string;
  memo: { type: string; value: string | null };
  preconditions: EnvelopePreconditions;
  /** sha256 of the declared passphrase. Declared, never read from the envelope. */
  networkIdHex: string | null;
  declaredPassphrase: string | null;
  rawOperations: unknown[];
  unknownFields: UnknownField[];
};

function memoOf(transaction: Transaction): { type: string; value: string | null } {
  const memo = transaction.memo as unknown as { _type?: string; _value?: unknown };
  const type = typeof memo?._type === "string" ? memo._type : "none";
  const raw = memo?._value;

  if (raw === undefined || raw === null) return { type, value: null };
  if (typeof raw === "string") return { type, value: raw };

  if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) {
    const bytes = Buffer.from(raw as Uint8Array);

    return { type, value: type === "text" ? bytes.toString("utf8") : bytes.toString("hex") };
  }

  if (typeof raw === "object") {
    // A text memo arrives as an indexed byte object in some SDK builds.
    const values = Object.values(raw as Record<string, unknown>).filter((entry): entry is number => typeof entry === "number");

    if (values.length > 0) {
      const bytes = Buffer.from(values);

      return { type, value: type === "text" ? bytes.toString("utf8") : bytes.toString("hex") };
    }
  }

  return { type, value: String(raw) };
}

function preconditionsOf(transaction: Transaction, evaluatedAtMs: number): EnvelopePreconditions {
  const bounds = transaction.timeBounds ?? null;
  const maxTime = bounds?.maxTime ? String(bounds.maxTime) : null;
  const ledgerBounds = (transaction as unknown as { ledgerBounds?: { minLedger?: number; maxLedger?: number } }).ledgerBounds;
  const minAccountSequence = (transaction as unknown as { minAccountSequence?: string }).minAccountSequence;

  return {
    minTime: bounds?.minTime ? String(bounds.minTime) : null,
    maxTime,
    // maxTime of 0 means "no upper bound" in Stellar, not "expired in 1970".
    expired: maxTime !== null && maxTime !== "0" && Number(maxTime) * 1000 < evaluatedAtMs,
    ledgerBounds: ledgerBounds ? `${ledgerBounds.minLedger ?? 0}–${ledgerBounds.maxLedger ?? 0}` : null,
    minAccountSequence: minAccountSequence ? String(minAccountSequence) : null,
  };
}

export function decodeStellarEnvelope(
  xdr: string,
  declaredPassphrase: string | undefined,
  evaluatedAtMs: number,
): StellarEnvelopeDecoding {
  // The passphrase is needed to construct the SDK object, but it does not
  // change what the envelope contains; a placeholder keeps decoding possible
  // when the caller declared none, and the binding is reported as unchecked.
  const passphrase = declaredPassphrase ?? "Public Global Stellar Network ; September 2015";

  let parsed: Transaction | FeeBumpTransaction;

  try {
    parsed = TransactionBuilder.fromXDR(xdr, passphrase);
  } catch (error) {
    throw new SigningInspectorError(
      "malformed_envelope",
      "The transaction envelope could not be read as XDR.",
      { reason: error instanceof Error ? error.message.slice(0, 200) : "unknown" },
    );
  }

  const isFeeBump = parsed instanceof FeeBumpTransaction;
  const inner = isFeeBump ? (parsed as FeeBumpTransaction).innerTransaction : (parsed as Transaction);
  const unknownFields: UnknownField[] = [];

  const operations = inner.operations as unknown[];

  if (operations.length > SIGNING_LIMITS.maxOperations) {
    throw new SigningInspectorError("envelope_too_large", `The envelope carries more than ${SIGNING_LIMITS.maxOperations} operations.`);
  }

  if (isFeeBump) {
    unknownFields.push({
      location: "envelope.feeBump",
      description:
        "This is a fee-bump envelope: one account pays the fee for another account's transaction. The inner transaction is what is described below.",
      raw: (parsed as FeeBumpTransaction).feeSource,
    });
  }

  return {
    source: inner.source,
    feeBumpSource: isFeeBump ? (parsed as FeeBumpTransaction).feeSource : null,
    isFeeBump,
    fee: isFeeBump ? (parsed as FeeBumpTransaction).fee : inner.fee,
    sequence: inner.sequence,
    memo: memoOf(inner),
    preconditions: preconditionsOf(inner, evaluatedAtMs),
    networkIdHex: declaredPassphrase ? Buffer.from(hash(Buffer.from(declaredPassphrase))).toString("hex") : null,
    declaredPassphrase: declaredPassphrase ?? null,
    rawOperations: operations,
    unknownFields,
  };
}
