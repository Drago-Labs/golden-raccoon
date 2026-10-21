import { xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { explainOperationCode, explainTransactionCode, isTransactionLevelCode } from "@/server/research/tx-failure-diagnostics/resultCodes";
import { decodeResultXdr } from "@/server/research/tx-failure-diagnostics/xdrDecoder";

function resultXdr(result: xdr.TransactionResultResult): string {
  return new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString("100"),
    result,
    ext: xdr.TransactionResultExt.v0(),
  }).toXDR("base64");
}

describe("result code explanations", () => {
  it("treats sequence, time, and fee failures as transaction-level", () => {
    for (const code of ["tx_bad_seq", "tx_too_late", "tx_insufficient_fee"]) {
      expect(isTransactionLevelCode(code)).toBe(true);
      expect(explainTransactionCode(code)).not.toMatch(/operation failed/i);
    }
    expect(isTransactionLevelCode("tx_failed")).toBe(false);
  });

  it("decodes tx_too_late and tx_insufficient_fee from XDR", () => {
    expect(decodeResultXdr(resultXdr(xdr.TransactionResultResult.txTooLate())).code).toBe("tx_too_late");
    expect(decodeResultXdr(resultXdr(xdr.TransactionResultResult.txInsufficientFee())).code).toBe("tx_insufficient_fee");
  });

  it("names known operation codes and leaves unknown codes verbatim", () => {
    expect(explainOperationCode("op_underfunded")).toMatch(/enough/i);
    expect(explainOperationCode("op_no_trust")).toMatch(/trustline/i);
    expect(explainOperationCode("op_custom_future")).toBe("Unknown result code: op_custom_future");
    expect(explainTransactionCode("tx_custom_future")).toBe("Unknown result code: tx_custom_future");
  });
});
