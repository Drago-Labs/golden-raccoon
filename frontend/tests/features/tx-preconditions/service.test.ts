import { describe, expect, it, vi } from "vitest";
import { coverageNotice } from "@/server/research/tx-preconditions/coverage";
import { TxPreconditionsError } from "@/server/research/tx-preconditions/errors";
import { explainTransactionPreconditions } from "@/server/research/tx-preconditions";
import { TX_PRECONDITIONS_LIMITS } from "@/server/research/tx-preconditions/limits";
import {
  depsFor,
  expiredBoundsFixture,
  feeBumpFixture,
  futureSequenceFixture,
  requestFor,
  unavailableDeps,
  validNowFixture,
} from "./fixtures";

describe("explainTransactionPreconditions", () => {
  it("marks a valid-now fixture as currently valid", async () => {
    const report = await explainTransactionPreconditions(requestFor(validNowFixture), depsFor(validNowFixture));

    expect(report.state).toBe("complete");
    expect(report.signsOrSubmits).toBe(false);
    expect(report.readOnly).toBe(true);
    expect(report.validityWindow.currentlyValid).toBe(true);
    expect(report.preconditions.every((row) => row.status === "satisfied" || row.status === "not_set")).toBe(true);
    expect(report.coverageNotice).toBe(coverageNotice("complete", []));
  });

  it("explains expired time and ledger bounds", async () => {
    const report = await explainTransactionPreconditions(
      requestFor(expiredBoundsFixture),
      depsFor(expiredBoundsFixture),
    );

    expect(report.validityWindow.currentlyValid).toBe(false);
    expect(report.preconditions.find((row) => row.name === "timeBounds")?.status).toBe("unsatisfied");
    expect(report.preconditions.find((row) => row.name === "ledgerBounds")?.status).toBe("unsatisfied");
    expect(report.validityWindow.invalidReasons.length).toBeGreaterThan(0);
  });

  it("flags a future minAccountSequence", async () => {
    const report = await explainTransactionPreconditions(
      requestFor(futureSequenceFixture),
      depsFor(futureSequenceFixture),
    );

    expect(report.validityWindow.currentlyValid).toBe(false);
    expect(report.preconditions.find((row) => row.name === "minAccountSequence")?.status).toBe("unsatisfied");
  });

  it("unwraps fee-bump envelopes and lists unsigned extra signers", async () => {
    const report = await explainTransactionPreconditions(requestFor(feeBumpFixture), depsFor(feeBumpFixture));

    expect(report.envelope?.isFeeBump).toBe(true);
    expect(report.envelope?.feeSource).toBe(feeBumpFixture.fee_source);
    expect(report.extraSigners[0]?.key).toBe(feeBumpFixture.extra_signer);
    expect(report.extraSigners[0]?.signaturePresent).toBe(false);
    expect(report.validityWindow.currentlyValid).toBe(false);
  });

  it("returns unavailable without inventing ledger state", async () => {
    const report = await explainTransactionPreconditions(requestFor(validNowFixture), unavailableDeps());

    expect(report.state).toBe("unavailable");
    expect(report.ledger).toBeNull();
    expect(report.coverageNotice).toMatch(/unavailable/i);
    expect(report.envelope?.sourceAccount).toBe(validNowFixture.account?.id);
  });

  it("rejects an invalid request before reading", async () => {
    const readLedger = vi.fn(async () => ({ status: "missing" as const }));
    await expect(
      explainTransactionPreconditions(
        { envelopeXdr: "", network: "stellar-testnet" },
        { readLedger, readAccount: async () => ({ status: "missing" }) },
      ),
    ).rejects.toBeInstanceOf(TxPreconditionsError);
    expect(readLedger).not.toHaveBeenCalled();
    expect(TX_PRECONDITIONS_LIMITS.maxEnvelopeXdrChars).toBeGreaterThan(0);
  });
});
