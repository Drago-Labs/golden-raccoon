import { describe, expect, it } from "vitest";
import { decodeEnvelope } from "@/server/research/tx-preconditions/envelopeDecode";
import { unwrapFeeBump } from "@/server/research/tx-preconditions/feeBumpUnwrap";
import { TxPreconditionsError } from "@/server/research/tx-preconditions/errors";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { expectedPassphrase } from "@/server/research/tx-preconditions/schema";
import { feeBumpFixture, validNowFixture } from "./fixtures";

describe("envelopeDecode", () => {
  it("decodes CAP-21 fields from a classic envelope", () => {
    const decoded = decodeEnvelope(validNowFixture.envelope_xdr, "stellar-testnet");

    expect(decoded.isFeeBump).toBe(false);
    expect(decoded.sourceAccount).toBe(validNowFixture.account?.id);
    expect(decoded.preconditions.minTime).toBeTruthy();
    expect(decoded.preconditions.maxTime).toBeTruthy();
    expect(decoded.preconditions.minLedger).toBe(1000);
    expect(decoded.preconditions.maxLedger).toBe(999999);
    expect(decoded.preconditions.minAccountSequence).toBe("50");
    expect(decoded.preconditions.minAccountSequenceAge).toBe("60");
    expect(decoded.preconditions.minAccountSequenceLedgerGap).toBe(5);
  });

  it("unwraps a fee-bump envelope to the inner transaction", () => {
    const decoded = decodeEnvelope(feeBumpFixture.envelope_xdr, "stellar-testnet");
    expect(decoded.isFeeBump).toBe(true);
    expect(decoded.feeSource).toBe(feeBumpFixture.fee_source);
    expect(decoded.sourceAccount).toBe(feeBumpFixture.account?.id);

    const parsed = TransactionBuilder.fromXDR(
      feeBumpFixture.envelope_xdr,
      expectedPassphrase("stellar-testnet"),
    );
    const unwrapped = unwrapFeeBump(parsed as never);
    expect(unwrapped.isFeeBump).toBe(true);
    expect(unwrapped.inner.source).toBe(feeBumpFixture.account?.id);
  });

  it("throws a typed error for malformed XDR", () => {
    expect(() => decodeEnvelope("AAAAAgAAnotrealxdr====", "stellar-testnet")).toThrow(TxPreconditionsError);
  });
});
