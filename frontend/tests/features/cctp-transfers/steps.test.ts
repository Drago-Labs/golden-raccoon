import { describe, expect, it } from "vitest";
import { summarizeCoverage } from "@/server/research/cctp-transfers/coverage";
import { reconcileAmount } from "@/server/research/cctp-transfers/stepState";
import type { AttestationStep, BurnStep, DestinationStep } from "@/server/research/cctp-transfers/schema";

function burn(partial: Partial<BurnStep>): BurnStep {
  return {
    state: "completed",
    blockNumber: 1,
    nonce: `0x${"a".repeat(64)}`,
    burnTokenAddress: null,
    depositorAddress: null,
    mintRecipientRaw: null,
    mintRecipientDisplay: null,
    destinationDomain: 27,
    destinationChain: "Stellar",
    maxFeeBaseUnits: "50",
    minFinalityThreshold: 1000,
    amountBaseUnits: "500000",
    rawMessageHex: null,
    issues: [],
    ...partial,
  };
}

function attestation(partial: Partial<AttestationStep>): AttestationStep {
  return { state: "completed", status: "complete", feeExecutedBaseUnits: "50", cctpVersion: 2, destinationMintTxHashReported: null, attestedMessageHex: null, issues: [], ...partial };
}

function destination(partial: Partial<DestinationStep>): DestinationStep {
  return { state: "completed", destinationChain: "Stellar", nonceUsed: true, issues: [], ...partial };
}

describe("reconcileAmount", () => {
  it("reconciles gross minus fee exactly, including fees", () => {
    const result = reconcileAmount(burn({ amountBaseUnits: "500000" }), attestation({ feeExecutedBaseUnits: "50" }));
    expect(result.state).toBe("reconciled");
    expect(result.netAmountBaseUnits).toBe("499950");
  });

  it("reports no fee charged distinctly from a fee of zero not yet known", () => {
    const result = reconcileAmount(burn({ amountBaseUnits: "500000" }), attestation({ feeExecutedBaseUnits: "0" }));
    expect(result.state).toBe("reconciled");
    expect(result.netAmountBaseUnits).toBe("500000");
    expect(result.note).toMatch(/No destination fee/);
  });

  it("reports pending_fee before the fee is attested", () => {
    const result = reconcileAmount(burn({}), attestation({ feeExecutedBaseUnits: null }));
    expect(result.state).toBe("pending_fee");
    expect(result.netAmountBaseUnits).toBeNull();
  });

  it("reports unknown when the burn amount could not be read", () => {
    const result = reconcileAmount(burn({ amountBaseUnits: null }), attestation({}));
    expect(result.state).toBe("unknown");
  });

  it("reports unknown rather than a negative amount when the fee exceeds the burn", () => {
    const result = reconcileAmount(burn({ amountBaseUnits: "10" }), attestation({ feeExecutedBaseUnits: "50" }));
    expect(result.state).toBe("unknown");
    expect(result.netAmountBaseUnits).toBeNull();
  });
});

describe("summarizeCoverage", () => {
  it("reports complete when all three steps completed", () => {
    expect(summarizeCoverage(burn({}), attestation({}), destination({})).state).toBe("complete");
  });

  it("reports unavailable when the burn itself could not be read", () => {
    expect(summarizeCoverage(burn({ state: "unknown", issues: ["no rpc"] }), attestation({}), destination({})).state).toBe("unavailable");
  });

  it("reports partial when the source transaction is not yet mined", () => {
    expect(summarizeCoverage(burn({ state: "pending" }), attestation({ state: "unknown" }), destination({ state: "unknown" })).state).toBe("partial");
  });

  it("reports partial when the destination has not received the message yet", () => {
    expect(summarizeCoverage(burn({}), attestation({}), destination({ state: "pending", nonceUsed: false })).state).toBe("partial");
  });
});
