import { describe, expect, it } from "vitest";
import { splitFeeBump } from "@/server/research/tx-failure-diagnostics/feeBump";
import { diagnoseOperations } from "@/server/research/tx-failure-diagnostics/operationDiagnosis";
import { decodeEnvelopeXdr, decodeResultXdr } from "@/server/research/tx-failure-diagnostics/xdrDecoder";
import { feeBumpFixture } from "./fixtures";

describe("fee-bump failures", () => {
  it("reports the outer wrapper and the inner operation failure separately", () => {
    const result = decodeResultXdr(feeBumpFixture.result_xdr);
    const split = splitFeeBump(result);
    const envelope = decodeEnvelopeXdr(feeBumpFixture.envelope_xdr);
    const operations = diagnoseOperations(envelope.operations, result.operationResults, split?.innerCode ?? result.code);

    expect(split).toMatchObject({
      outerCode: "tx_fee_bump_inner_failed",
      innerCode: "tx_failed",
      outerFeeChargedStroops: "200",
      innerFeeChargedStroops: "100",
    });
    expect(split?.innerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.feeSource).toBeTruthy();
    expect(envelope.feeSource).not.toBe(envelope.sourceAccount);
    expect(operations.map((operation) => operation.resultCode)).toEqual(["op_success", "op_no_trust"]);
    expect(operations[1]?.outcome).toBe("aborted_transaction");
    expect(operations[1]?.explanation).toMatch(/trustline/i);
  });
});
