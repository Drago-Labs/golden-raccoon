/**
 * Public entry point for the offline signing payload inspector.
 *
 * `inspectSigningPayload` is pure and stateless. It performs no network I/O of
 * any kind — no RPC, no token metadata, no simulation — holds no payload
 * between calls, and produces nothing a wallet could submit. Its output is a
 * description, and it says so in `decodingIsNotApproval`.
 */
import { bindEvmCalldata, bindStellarEnvelope, bindTypedData } from "./contextBinding";
import { decodeCalldata } from "./evmCalldata";
import { decodeOperations } from "./operations";
import { orderPermissions } from "./permissions";
import { assertWithinPayloadSize } from "./payloadLimits";
import { decodeStellarEnvelope } from "./stellarEnvelope";
import { decodeTypedData } from "./typedData";
import {
  SIGNING_SCHEMA_VERSION,
  SigningInspectorError,
  signingRequestSchema,
  type ContextBinding,
  type DecodedOperation,
  type Permission,
  type SigningCoverage,
  type SigningReport,
  type UnknownField,
} from "./schema";

function buildCoverage(permissions: Permission[], operations: DecodedOperation[], unknownFields: UnknownField[]): SigningCoverage {
  const decodedFieldCount = permissions.length + operations.filter((operation) => operation.supported).length;

  if (decodedFieldCount === 0 && unknownFields.length === 0) {
    return {
      state: "empty",
      note: "The payload is well-formed and requests nothing this inspector recognizes as a permission. This is a successful result.",
      decodedFieldCount,
      unknownFieldCount: 0,
    };
  }

  if (decodedFieldCount === 0) {
    return {
      state: "unavailable",
      note: "Nothing in the payload could be interpreted. Everything it contains is listed as unrecognized, unchanged.",
      decodedFieldCount,
      unknownFieldCount: unknownFields.length,
    };
  }

  if (unknownFields.length > 0) {
    return {
      state: "partial",
      note: "Part of the payload was decoded and part was not. The undecoded parts are listed in full and were not discarded.",
      decodedFieldCount,
      unknownFieldCount: unknownFields.length,
    };
  }

  return {
    state: "complete",
    note: "Every field in the payload was decoded. That the bytes are readable is not a statement that signing them is safe.",
    decodedFieldCount,
    unknownFieldCount: 0,
  };
}

export function inspectSigningPayload(input: unknown): SigningReport {
  const parsed = signingRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new SigningInspectorError("invalid_request", "The inspection request could not be read.", parsed.error.flatten());
  }

  const evaluatedAtMs = Date.parse(parsed.data.evaluatedAt);

  if (!Number.isFinite(evaluatedAtMs)) {
    throw new SigningInspectorError("invalid_evaluated_at", "The evaluation time could not be read.");
  }

  const { expected, payload } = parsed.data;

  if (payload.kind === "evm_calldata") {
    assertWithinPayloadSize(payload.data, "calldata");

    const decoding = decodeCalldata(payload.data, payload.to?.toLowerCase() ?? null);
    const unknownFields = [...decoding.unknownFields];

    if (payload.value && payload.value !== "0") {
      unknownFields.push({
        location: "payload.value",
        description: "The request also attaches native value, which the calldata does not describe.",
        raw: payload.value,
      });
    }

    const permissions = orderPermissions(decoding.permissions);

    return {
      schemaVersion: SIGNING_SCHEMA_VERSION,
      evaluatedAt: new Date(evaluatedAtMs).toISOString(),
      payloadKind: "evm_calldata",
      summary: decoding.summary,
      permissions,
      operations: [],
      unknownFields,
      contextBinding: bindEvmCalldata(expected, { to: payload.to, chainId: payload.chainId }),
      coverage: buildCoverage(permissions, [], unknownFields),
      decodingIsNotApproval: true,
      readOnly: true,
    };
  }

  if (payload.kind === "evm_typed_data") {
    const decoding = decodeTypedData(payload.typedData, evaluatedAtMs);
    const permissions = orderPermissions(decoding.permissions);
    const owner = decoding.fields.find((field) => field.name === "owner")?.value ?? null;

    const contextBinding: ContextBinding[] = bindTypedData(expected, decoding.domain, owner === "" ? null : owner);

    return {
      schemaVersion: SIGNING_SCHEMA_VERSION,
      evaluatedAt: new Date(evaluatedAtMs).toISOString(),
      payloadKind: "evm_typed_data",
      summary: decoding.summary,
      permissions,
      operations: decoding.fields.map((field, index) => ({
        index,
        type: field.type,
        supported: true,
        summary: `${field.name}: ${field.value || "(empty)"}`,
        fields: [{ label: field.name, value: field.value }],
      })),
      unknownFields: decoding.unknownFields,
      contextBinding,
      coverage: buildCoverage(permissions, [], decoding.unknownFields),
      decodingIsNotApproval: true,
      readOnly: true,
    };
  }

  assertWithinPayloadSize(payload.xdr, "transaction envelope");

  const envelope = decodeStellarEnvelope(payload.xdr, payload.networkPassphrase, evaluatedAtMs);
  const decodedOperations = decodeOperations(envelope.rawOperations, envelope.source);
  const permissions = orderPermissions(decodedOperations.permissions);
  const unknownFields = [...envelope.unknownFields, ...decodedOperations.unknownFields];

  if (envelope.preconditions.expired) {
    unknownFields.push({
      location: "preconditions.maxTime",
      description: "The transaction's time bound has already passed at the evaluation time supplied, so it would be rejected.",
      raw: envelope.preconditions.maxTime ?? "",
    });
  }

  const summaryParts = [
    `A Stellar transaction from ${envelope.source} with ${envelope.rawOperations.length} operation${envelope.rawOperations.length === 1 ? "" : "s"}.`,
  ];

  if (envelope.isFeeBump) summaryParts.push(`Its fee is paid by ${envelope.feeBumpSource}.`);
  if (envelope.memo.type !== "none") summaryParts.push(`It carries a ${envelope.memo.type} memo.`);

  return {
    schemaVersion: SIGNING_SCHEMA_VERSION,
    evaluatedAt: new Date(evaluatedAtMs).toISOString(),
    payloadKind: "stellar_envelope",
    summary: summaryParts.join(" "),
    permissions,
    operations: decodedOperations.operations,
    unknownFields,
    contextBinding: bindStellarEnvelope(expected, envelope),
    coverage: buildCoverage(permissions, decodedOperations.operations, unknownFields),
    decodingIsNotApproval: true,
    readOnly: true,
  };
}

export { SigningInspectorError } from "./schema";
export type { SigningReport } from "./schema";
