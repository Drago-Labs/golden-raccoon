import { describe, expect, it } from "vitest";
import { interpretLedgerState } from "@/server/research/tx-failure-diagnostics/ledgerState";
import { diagnoseOperations } from "@/server/research/tx-failure-diagnostics/operationDiagnosis";
import { decodeEnvelopeXdr, decodeResultXdr } from "@/server/research/tx-failure-diagnostics/xdrDecoder";
import { badSequenceFixture, underfundedFixture } from "./fixtures";

describe("operation diagnosis", () => {
  it("marks the successful prefix, the aborting operation, and the unattempted tail", () => {
    const result = decodeResultXdr(underfundedFixture.result_xdr);
    const envelope = decodeEnvelopeXdr(underfundedFixture.envelope_xdr);
    const operations = diagnoseOperations(envelope.operations, result.operationResults, result.code);

    expect(operations.map((operation) => operation.outcome)).toEqual([
      "would_succeed_alone",
      "aborted_transaction",
      "not_attempted",
    ]);
    expect(operations[1]?.resultCode).toBe("op_underfunded");
    expect(operations[2]?.resultCode).toBeNull();
    expect(operations[0]?.explanation).toMatch(/on its own/i);
    expect(operations[2]?.explanation).toMatch(/not attempted/i);
  });

  it("does not describe a bad sequence as an operation abort", () => {
    const result = decodeResultXdr(badSequenceFixture.result_xdr);
    const envelope = decodeEnvelopeXdr(badSequenceFixture.envelope_xdr);
    const operations = diagnoseOperations(envelope.operations, result.operationResults, result.code);

    expect(result.code).toBe("tx_bad_seq");
    expect(operations).toHaveLength(1);
    expect(operations[0]?.outcome).toBe("not_attempted");
    expect(operations[0]?.explanation).toMatch(/tx_bad_seq/);
    expect(operations[0]?.explanation).not.toMatch(/underfunded/i);
  });

  it("uses a historical balance for underfunded evidence and refuses a missing snapshot", () => {
    const historical = interpretLedgerState(
      underfundedFixture.source_account,
      underfundedFixture.account,
      { ledger: underfundedFixture.ledger, envelopeSequence: "11", failingAmountStroops: "50000000", failingCode: "op_underfunded" },
    );
    expect(historical.status).toBe("historical");
    expect(historical.note).toMatch(/1\.5000000/);
    expect(historical.note).toMatch(/base reserve/i);

    const missing = interpretLedgerState(underfundedFixture.source_account, null, {
      ledger: underfundedFixture.ledger,
      envelopeSequence: "11",
      failingAmountStroops: "50000000",
      failingCode: "op_underfunded",
    });
    expect(missing.status).toBe("missing");
    expect(missing.nativeBalance).toBeNull();
    expect(missing.note).toMatch(/guessed/i);
  });
});
