import { describe, expect, it } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { horizonBase } from "@/server/research/tx-failure-diagnostics/networkIdentity";
import { readRecordedTransaction, transactionUrl } from "@/server/research/tx-failure-diagnostics/transactionReader";
import { decodeEnvelopeXdr, decodeResultXdr } from "@/server/research/tx-failure-diagnostics/xdrDecoder";
import { TxFailureDiagnosticsError } from "@/server/research/tx-failure-diagnostics/errors";
import { badSequenceFixture, underfundedFixture } from "./fixtures";

describe("result and envelope XDR", () => {
  it("decodes an underfunded payment without dropping the unattempted operation", () => {
    const result = decodeResultXdr(underfundedFixture.result_xdr);
    const envelope = decodeEnvelopeXdr(underfundedFixture.envelope_xdr);

    expect(result.code).toBe("tx_failed");
    expect(result.operationResults.map((operation) => operation.resultCode)).toEqual(["op_success", "op_underfunded"]);
    expect(envelope.operations).toHaveLength(3);
    expect(envelope.sequence).toBe("11");
    expect(envelope.sourceAccount).toBe(underfundedFixture.source_account);
  });

  it("decodes a transaction-level bad sequence with no operation results", () => {
    const result = decodeResultXdr(badSequenceFixture.result_xdr);
    expect(result.code).toBe("tx_bad_seq");
    expect(result.operationResults).toEqual([]);
    expect(result.feeBump).toBeNull();
  });

  it("rejects malformed result XDR", () => {
    expect(() => decodeResultXdr("not-xdr")).toThrow(TxFailureDiagnosticsError);
  });

  it("round-trips the recorded result bytes", () => {
    const decoded = xdr.TransactionResult.fromXDR(underfundedFixture.result_xdr, "base64");
    expect(decoded.toXDR("base64")).toBe(underfundedFixture.result_xdr);
  });

  it("keeps pubnet transaction URLs off the testnet host", () => {
    const hash = underfundedFixture.hash;
    expect(horizonBase("stellar-pubnet")).toBe("https://horizon.stellar.org");
    expect(transactionUrl("stellar-pubnet", hash)).not.toContain("horizon-testnet");
    expect(transactionUrl("stellar-testnet", hash)).toContain("https://horizon-testnet.stellar.org/transactions/");
  });

  it("reads a recorded transaction body and reports provider failure", async () => {
    const ok = await readRecordedTransaction("stellar-testnet", underfundedFixture.hash, async () => {
      return new Response(JSON.stringify(underfundedFixture), { status: 200 });
    });
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") expect(ok.value.envelopeXdr).toBe(underfundedFixture.envelope_xdr);

    const down = await readRecordedTransaction("stellar-pubnet", underfundedFixture.hash, async (url) => {
      expect(String(url)).not.toContain("horizon-testnet");
      return new Response("down", { status: 503 });
    });
    expect(down).toEqual({ status: "unavailable", reason: "HTTP 503" });
  });
});
