/**
 * EIP-712 typed data, decoded from its declared schema.
 *
 * The types table travels with the payload, so the decoder reads the fields
 * the document itself declares rather than pattern-matching on names it hopes
 * to find. ERC-2612 `Permit` is recognized only when the declared type
 * actually has ERC-2612's five fields in ERC-2612's order — a document that
 * calls its primary type "Permit" while declaring something else is reported
 * as an unrecognized structure, which is what it is.
 */
import { measureShape } from "./payloadLimits";
import {
  MAX_UINT256,
  SIGNING_LIMITS,
  SigningInspectorError,
  type DeadlineInfo,
  type Permission,
  type UnknownField,
} from "./schema";

export type TypedDataDomain = {
  name: string | null;
  version: string | null;
  chainId: string | null;
  verifyingContract: string | null;
  salt: string | null;
};

export type TypedDataDecoding = {
  primaryType: string | null;
  domain: TypedDataDomain;
  /** Declared fields of the primary type, with the values found for them. */
  fields: Array<{ name: string; type: string; value: string }>;
  permissions: Permission[];
  unknownFields: UnknownField[];
  summary: string;
};

const ERC2612_PERMIT_FIELDS = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function scalarToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return value.toString();

  return JSON.stringify(value);
}

/** Parses a uint that may arrive as a decimal string, a hex string or a number. */
function toBigIntOrNull(value: unknown): bigint | null {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return Number.isSafeInteger(value) ? BigInt(value) : null;

    if (typeof value === "string") {
      const trimmed = value.trim();

      if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return BigInt(trimmed);
      if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
    }
  } catch {
    return null;
  }

  return null;
}

function buildDeadline(value: unknown, evaluatedAtMs: number): { info: DeadlineInfo | null; unknown: UnknownField | null } {
  const seconds = toBigIntOrNull(value);

  if (seconds === null) {
    return {
      info: null,
      unknown: {
        location: "message.deadline",
        description: "The deadline is not a readable integer, so whether the permit has expired is unknown.",
        raw: scalarToString(value).slice(0, 120),
      },
    };
  }

  // A deadline far beyond the representable date range is still a valid
  // uint256; it is reported with a null date rather than a wrong one.
  const milliseconds = seconds * 1000n;
  const withinDateRange = milliseconds <= 8_640_000_000_000_000n;

  return {
    info: {
      unixSeconds: seconds.toString(),
      iso: withinDateRange ? new Date(Number(milliseconds)).toISOString() : null,
      expired: milliseconds < BigInt(evaluatedAtMs),
    },
    unknown: null,
  };
}

export function decodeTypedData(input: unknown, evaluatedAtMs: number): TypedDataDecoding {
  const shape = measureShape(input);

  if (!shape.ok) {
    throw new SigningInspectorError("typed_data_too_complex", shape.reason);
  }

  const document = asRecord(input);

  if (!document) {
    throw new SigningInspectorError("malformed_typed_data", "The typed data is not an object.");
  }

  const domainRecord = asRecord(document.domain) ?? {};
  const typesRecord = asRecord(document.types) ?? {};
  const messageRecord = asRecord(document.message) ?? {};
  const primaryType = typeof document.primaryType === "string" ? document.primaryType : null;

  if (Object.keys(typesRecord).length > SIGNING_LIMITS.maxTypedDataTypes) {
    throw new SigningInspectorError("typed_data_too_complex", `The type table declares more than ${SIGNING_LIMITS.maxTypedDataTypes} types.`);
  }

  const chainId = toBigIntOrNull(domainRecord.chainId);

  const domain: TypedDataDomain = {
    name: typeof domainRecord.name === "string" ? domainRecord.name : null,
    version: typeof domainRecord.version === "string" ? domainRecord.version : null,
    chainId: chainId === null ? null : chainId.toString(),
    verifyingContract:
      typeof domainRecord.verifyingContract === "string" && /^0x[0-9a-fA-F]{40}$/.test(domainRecord.verifyingContract)
        ? domainRecord.verifyingContract.toLowerCase()
        : null,
    salt: typeof domainRecord.salt === "string" ? domainRecord.salt : null,
  };

  const unknownFields: UnknownField[] = [];

  if (domainRecord.chainId !== undefined && chainId === null) {
    unknownFields.push({
      location: "domain.chainId",
      description: "The domain declares a chain id that is not a readable integer.",
      raw: scalarToString(domainRecord.chainId).slice(0, 120),
    });
  }

  if (domainRecord.verifyingContract !== undefined && domain.verifyingContract === null) {
    unknownFields.push({
      location: "domain.verifyingContract",
      description: "The domain declares a verifying contract that is not a 20-byte address.",
      raw: scalarToString(domainRecord.verifyingContract).slice(0, 120),
    });
  }

  const declaredFields = Array.isArray(typesRecord[primaryType ?? ""])
    ? (typesRecord[primaryType ?? ""] as unknown[])
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
        .map((entry) => ({
          name: typeof entry.name === "string" ? entry.name : "",
          type: typeof entry.type === "string" ? entry.type : "",
        }))
    : [];

  const fields = declaredFields.map((field) => ({
    name: field.name,
    type: field.type,
    value: scalarToString(messageRecord[field.name]),
  }));

  // Message keys the declared type does not mention are shown, not dropped:
  // an undeclared field is not signed, and a reader should be able to see the
  // discrepancy rather than be reassured by a tidy field list.
  for (const key of Object.keys(messageRecord)) {
    if (!declaredFields.some((field) => field.name === key)) {
      unknownFields.push({
        location: `message.${key}`,
        description: "This field is present in the message but not declared in the primary type.",
        raw: scalarToString(messageRecord[key]).slice(0, 200),
      });
    }
  }

  const isErc2612Permit =
    primaryType === "Permit" &&
    declaredFields.length === ERC2612_PERMIT_FIELDS.length &&
    ERC2612_PERMIT_FIELDS.every((expected, index) => declaredFields[index]?.name === expected.name && declaredFields[index]?.type === expected.type);

  const permissions: Permission[] = [];

  if (isErc2612Permit) {
    const value = toBigIntOrNull(messageRecord.value);
    const deadline = buildDeadline(messageRecord.deadline, evaluatedAtMs);

    if (deadline.unknown) unknownFields.push(deadline.unknown);

    if (value === null) {
      unknownFields.push({
        location: "message.value",
        description: "The permit value is not a readable integer, so the amount granted is unknown.",
        raw: scalarToString(messageRecord.value).slice(0, 120),
      });
    }

    const amountRaw = value === null ? null : value.toString();

    permissions.push({
      permissionId: "erc2612-permit",
      kind: "permit_approval",
      spender: typeof messageRecord.spender === "string" ? messageRecord.spender.toLowerCase() : null,
      recipient: null,
      subject: domain.verifyingContract,
      amountRaw,
      isUnlimited: amountRaw === MAX_UINT256,
      deadline: deadline.info,
      rawProvenance: "EIP-712 message fields spender, value and deadline of the declared Permit type",
      consequence:
        amountRaw === MAX_UINT256
          ? "This signature alone lets the spender move the entire balance of the token named in the domain, with no transaction from you."
          : "This signature alone lets the spender move up to the stated amount of the token named in the domain, with no transaction from you.",
    });
  } else if (primaryType !== null) {
    unknownFields.push({
      location: "primaryType",
      description:
        primaryType === "Permit"
          ? "The primary type is named Permit but its declared fields are not ERC-2612's, so it was not decoded as a permit."
          : "This primary type is not one the inspector recognizes; its fields are listed but not interpreted.",
      raw: primaryType,
    });
  }

  if (primaryType === null) {
    unknownFields.push({
      location: "primaryType",
      description: "The document declares no primary type, so no structure could be decoded from it.",
      raw: "",
    });
  }

  const summary = isErc2612Permit
    ? "The payload is an ERC-2612 permit: a signature that grants an allowance without a transaction."
    : primaryType === null
      ? "The payload is typed data with no declared primary type."
      : `The payload is typed data of an unrecognized type (${primaryType}).`;

  return { primaryType, domain, fields, permissions, unknownFields, summary };
}
