import { FeeBumpTransaction, Transaction } from "@stellar/stellar-sdk";

export type UnwrappedEnvelope = {
  isFeeBump: boolean;
  inner: Transaction;
  feeSource: string | null;
  outerSignatureCount: number;
};

/** Peel a fee-bump wrapper so CAP-21 preconditions are always read from the inner transaction. */
export function unwrapFeeBump(parsed: Transaction | FeeBumpTransaction): UnwrappedEnvelope {
  if (parsed instanceof FeeBumpTransaction) {
    return {
      isFeeBump: true,
      inner: parsed.innerTransaction,
      feeSource: parsed.feeSource,
      outerSignatureCount: parsed.signatures.length,
    };
  }

  return {
    isFeeBump: false,
    inner: parsed,
    feeSource: null,
    outerSignatureCount: 0,
  };
}
