import { describe, expect, it } from "vitest";
import { SIGNING_LIMITS } from "@/server/research/signing-inspector/schema";
import { inspectSigningPayload } from "@/server/research/signing-inspector/service";
import {
  ACCOUNT_MERGE_XDR,
  BOUNDED_APPROVE,
  EXPIRED_PERMIT,
  EXPIRED_TIMEBOUNDS_XDR,
  FEE_BUMP_XDR,
  IMPOSTOR_PERMIT,
  MALFORMED_XDR,
  MAX_UINT256_DECIMAL,
  MULTI_OPERATION_XDR,
  OTHER_TOKEN,
  PUBLIC_PASSPHRASE,
  RECIPIENT,
  SINGLE_PAYMENT_XDR,
  SPENDER,
  STELLAR_DESTINATION,
  STELLAR_FEE_PAYER,
  STELLAR_SOURCE,
  TRANSFER,
  TRUNCATED_ARGS_CALLDATA,
  TRUNCATED_CALLDATA,
  UNKNOWN_SELECTOR_CALLDATA,
  UNKNOWN_TYPED_DATA,
  UNLIMITED_APPROVE,
  UNLIMITED_PERMIT,
  WRONG_CHAIN_PERMIT,
  WRONG_CONTRACT_PERMIT,
  calldataRequest,
  deeplyNestedTypedData,
  envelopeRequest,
  typedDataRequest,
} from "./fixtures";

describe("EVM calldata", () => {
  it("names an unlimited approval as unlimited and says what it allows", () => {
    const report = inspectSigningPayload(calldataRequest(UNLIMITED_APPROVE));
    const permission = report.permissions[0];

    expect(permission.kind).toBe("token_approval");
    expect(permission.spender).toBe(SPENDER);
    expect(permission.amountRaw).toBe(MAX_UINT256_DECIMAL);
    expect(permission.isUnlimited).toBe(true);
    expect(permission.consequence).toMatch(/entire balance/i);
  });

  it("keeps a bounded approval distinct from an unlimited one", () => {
    const report = inspectSigningPayload(calldataRequest(BOUNDED_APPROVE));

    expect(report.permissions[0].isUnlimited).toBe(false);
    expect(report.permissions[0].amountRaw).toBe("1000");
  });

  it("decodes a plain transfer with its recipient", () => {
    const report = inspectSigningPayload(calldataRequest(TRANSFER));

    expect(report.permissions[0].kind).toBe("token_transfer");
    expect(report.permissions[0].recipient).toBe(RECIPIENT);
    expect(report.coverage.state).toBe("complete");
  });

  it("leaves an unrecognized selector unrecognized instead of guessing", () => {
    const report = inspectSigningPayload(calldataRequest(UNKNOWN_SELECTOR_CALLDATA));

    expect(report.permissions).toHaveLength(0);
    expect(report.summary).toMatch(/unrecognized function/i);
    expect(report.unknownFields.some((field) => field.raw === "0xdeadbeef")).toBe(true);
    expect(report.coverage.state).toBe("unavailable");
  });

  it("shows every argument word of an unrecognized call", () => {
    const report = inspectSigningPayload(calldataRequest(UNKNOWN_SELECTOR_CALLDATA));

    expect(report.unknownFields.filter((field) => field.location.startsWith("calldata.arguments["))).toHaveLength(2);
  });

  it("reports truncated calldata rather than decoding part of it", () => {
    const report = inspectSigningPayload(calldataRequest(TRUNCATED_CALLDATA));

    expect(report.permissions).toHaveLength(0);
    expect(report.summary).toMatch(/too short/i);
  });

  it("refuses to read a recognized selector whose arguments are missing", () => {
    const report = inspectSigningPayload(calldataRequest(TRUNCATED_ARGS_CALLDATA));

    expect(report.permissions).toHaveLength(0);
    expect(report.summary).toMatch(/truncated/i);
  });

  it("surfaces attached native value the calldata does not describe", () => {
    const report = inspectSigningPayload(calldataRequest(TRANSFER, { value: "1000000000000000000" }));

    expect(report.unknownFields.some((field) => field.location === "payload.value")).toBe(true);
  });

  it("reports that raw calldata is bound to no chain", () => {
    const report = inspectSigningPayload(calldataRequest(TRANSFER, { chainId: undefined }));
    const binding = report.contextBinding.find((entry) => entry.field === "evm_chain_id");

    expect(binding?.state).toBe("not_bound");
    expect(binding?.note).toMatch(/carries no chain id/i);
  });

  it("flags a chain the caller did not expect", () => {
    const report = inspectSigningPayload(calldataRequest(TRANSFER, { chainId: 137 }));
    const binding = report.contextBinding.find((entry) => entry.field === "evm_chain_id");

    expect(binding?.state).toBe("mismatch");
  });
});

describe("ERC-2612 typed data", () => {
  it("decodes an unlimited permit and states that no transaction is needed", () => {
    const report = inspectSigningPayload(typedDataRequest(UNLIMITED_PERMIT));
    const permission = report.permissions[0];

    expect(permission.kind).toBe("permit_approval");
    expect(permission.isUnlimited).toBe(true);
    expect(permission.consequence).toMatch(/no transaction from you/i);
  });

  it("marks an expired permit as expired against the supplied clock", () => {
    const report = inspectSigningPayload(typedDataRequest(EXPIRED_PERMIT));

    expect(report.permissions[0].deadline?.expired).toBe(true);
    expect(report.permissions[0].isUnlimited).toBe(false);
  });

  it("does not consult a server clock for expiry", () => {
    const future = inspectSigningPayload({
      ...typedDataRequest(EXPIRED_PERMIT),
      evaluatedAt: "2020-01-01T00:00:00.000Z",
    });

    expect(future.permissions[0].deadline?.expired).toBe(false);
  });

  it("flags a domain bound to a different chain", () => {
    const report = inspectSigningPayload(typedDataRequest(WRONG_CHAIN_PERMIT));
    const binding = report.contextBinding.find((entry) => entry.field === "evm_chain_id");

    expect(binding?.state).toBe("mismatch");
    expect(binding?.observed).toBe("137");
    expect(binding?.note).toMatch(/valid on that chain/i);
  });

  it("flags a domain bound to a different verifying contract", () => {
    const report = inspectSigningPayload(typedDataRequest(WRONG_CONTRACT_PERMIT));
    const binding = report.contextBinding.find((entry) => entry.field === "verifying_contract");

    expect(binding?.state).toBe("mismatch");
    expect(binding?.observed).toBe(OTHER_TOKEN);
  });

  it("flags an owner that is not the expected account", () => {
    const report = inspectSigningPayload(typedDataRequest(UNLIMITED_PERMIT, { account: OTHER_TOKEN }));
    const binding = report.contextBinding.find((entry) => entry.field === "account");

    expect(binding?.state).toBe("mismatch");
  });

  it("refuses to decode a document that only calls itself a permit", () => {
    const report = inspectSigningPayload(typedDataRequest(IMPOSTOR_PERMIT));

    expect(report.permissions).toHaveLength(0);
    expect(report.unknownFields.some((field) => field.description.includes("not ERC-2612's"))).toBe(true);
  });

  it("lists an unrecognized primary type without interpreting it", () => {
    const report = inspectSigningPayload(typedDataRequest(UNKNOWN_TYPED_DATA));

    expect(report.permissions).toHaveLength(0);
    expect(report.summary).toMatch(/unrecognized type \(Order\)/);
  });

  it("never treats the domain name as verified", () => {
    const report = inspectSigningPayload(typedDataRequest(UNLIMITED_PERMIT));
    const binding = report.contextBinding.find((entry) => entry.field === "domain_name");

    expect(binding?.state).toBe("not_checked");
    expect(binding?.note).toMatch(/shown, not trusted/i);
  });

  it("refuses typed data nested past the published depth limit", () => {
    expect(() => inspectSigningPayload(typedDataRequest(deeplyNestedTypedData(SIGNING_LIMITS.maxTypedDataDepth + 4)))).toThrow(
      /nests deeper/i,
    );
  });

  it("refuses a typed-data document with too many nodes", () => {
    const wide = { domain: { chainId: 1 }, primaryType: "Wide", types: { Wide: [] }, message: Object.fromEntries(
      Array.from({ length: SIGNING_LIMITS.maxTypedDataNodes + 10 }, (_, index) => [`field${index}`, index]),
    ) };

    expect(() => inspectSigningPayload(typedDataRequest(wide))).toThrow(/more than/i);
  });
});

describe("Stellar envelopes", () => {
  it("decodes source, memo and a single payment", () => {
    const report = inspectSigningPayload(envelopeRequest(SINGLE_PAYMENT_XDR));

    expect(report.summary).toContain(STELLAR_SOURCE);
    expect(report.summary).toMatch(/text memo/);
    expect(report.operations).toHaveLength(1);
    expect(report.permissions[0].recipient).toBe(STELLAR_DESTINATION);
  });

  it("keeps every operation of a multi-operation transaction distinguishable", () => {
    const report = inspectSigningPayload(envelopeRequest(MULTI_OPERATION_XDR));

    expect(report.operations).toHaveLength(4);
    expect(report.operations.map((operation) => operation.type)).toEqual([
      "payment",
      "changeTrust",
      "setOptions",
      "bumpSequence",
    ]);
  });

  it("preserves an uninterpreted operation instead of dropping it", () => {
    const report = inspectSigningPayload(envelopeRequest(MULTI_OPERATION_XDR));
    const bumpSequence = report.operations.find((operation) => operation.type === "bumpSequence");

    expect(bumpSequence?.supported).toBe(false);
    expect(report.unknownFields.some((field) => field.location === "operations[3]")).toBe(true);
    expect(report.coverage.state).toBe("partial");
  });

  it("puts the operation that hands over control first", () => {
    const report = inspectSigningPayload(envelopeRequest(MULTI_OPERATION_XDR));

    expect(report.permissions[0].kind).toBe("stellar_account_change");
    expect(report.permissions[0].consequence).toMatch(/who can move funds/i);
  });

  it("decodes preconditions and reports an expired time bound", () => {
    const report = inspectSigningPayload(envelopeRequest(EXPIRED_TIMEBOUNDS_XDR));

    expect(report.unknownFields.some((field) => field.location === "preconditions.maxTime")).toBe(true);
  });

  it("names the fee payer of a fee-bump envelope separately from the source", () => {
    const report = inspectSigningPayload(envelopeRequest(FEE_BUMP_XDR));

    expect(report.summary).toContain(STELLAR_FEE_PAYER);
    expect(report.summary).toContain(STELLAR_SOURCE);
    expect(report.unknownFields.some((field) => field.location === "envelope.feeBump")).toBe(true);
  });

  it("describes an account merge as moving the entire balance", () => {
    const report = inspectSigningPayload(envelopeRequest(ACCOUNT_MERGE_XDR));

    expect(report.permissions[0].isUnlimited).toBe(true);
    expect(report.permissions[0].consequence).toMatch(/entire remaining balance/i);
  });

  it("flags a source account the caller did not expect", () => {
    const report = inspectSigningPayload(envelopeRequest(SINGLE_PAYMENT_XDR, {}, { account: STELLAR_DESTINATION }));
    const binding = report.contextBinding.find((entry) => entry.field === "account");

    expect(binding?.state).toBe("mismatch");
  });

  it("flags a signing network the caller did not expect", () => {
    const report = inspectSigningPayload(
      envelopeRequest(SINGLE_PAYMENT_XDR, { networkPassphrase: PUBLIC_PASSPHRASE }, { stellarNetworkPassphrase: undefined }),
    );
    const binding = report.contextBinding.find((entry) => entry.field === "stellar_network");

    expect(binding?.state).toBe("not_checked");
  });

  it("reports a mismatch when the declared network differs from the expected one", () => {
    const report = inspectSigningPayload(envelopeRequest(SINGLE_PAYMENT_XDR, { networkPassphrase: PUBLIC_PASSPHRASE }));
    const binding = report.contextBinding.find((entry) => entry.field === "stellar_network");

    expect(binding?.state).toBe("mismatch");
    expect(binding?.note).toMatch(/signed elsewhere is a different transaction/i);
  });

  it("states plainly that an envelope with no declared network is bound to none", () => {
    const report = inspectSigningPayload({
      evaluatedAt: "2026-03-01T12:00:00.000Z",
      expected: {},
      payload: { kind: "stellar_envelope", xdr: SINGLE_PAYMENT_XDR },
    });
    const binding = report.contextBinding.find((entry) => entry.field === "stellar_network");

    expect(binding?.state).toBe("not_bound");
    expect(binding?.note).toMatch(/carries no network identifier/i);
  });

  it("rejects malformed XDR within its bounds", () => {
    expect(() => inspectSigningPayload(envelopeRequest(MALFORMED_XDR))).toThrow(/could not be read as XDR/i);
  });

  it("rejects an oversized envelope before parsing it", () => {
    const oversized = "A".repeat(SIGNING_LIMITS.maxPayloadChars + 10);

    expect(() => inspectSigningPayload(envelopeRequest(oversized))).toThrow();
  });
});

describe("the report's own claims", () => {
  it("always declares that decoding is not approval", () => {
    for (const request of [calldataRequest(TRANSFER), typedDataRequest(UNLIMITED_PERMIT), envelopeRequest(SINGLE_PAYMENT_XDR)]) {
      const report = inspectSigningPayload(request);

      expect(report.decodingIsNotApproval).toBe(true);
      expect(report.readOnly).toBe(true);
    }
  });

  it("says so in the coverage note of a fully decoded payload", () => {
    const report = inspectSigningPayload(calldataRequest(TRANSFER));

    expect(report.coverage.note).toMatch(/not a statement that signing them is safe/i);
  });

  it("returns a successful empty result for calldata that requests nothing", () => {
    const report = inspectSigningPayload(calldataRequest("0x"));

    expect(report.coverage.state).toBe("empty");
    expect(report.permissions).toHaveLength(0);
  });

  it("rejects a request with no readable evaluation time", () => {
    expect(() => inspectSigningPayload({ ...calldataRequest(TRANSFER), evaluatedAt: "not a date" })).toThrow(/could not be read/i);
  });
});
