/**
 * Versioned contract for the offline signing payload and permission inspector.
 *
 * The line this feature refuses to cross: **a payload it could decode is not a
 * payload it has judged safe.** Decoding proves the bytes are well-formed and
 * says what they request. It says nothing about whether the recipient is
 * honest, whether the contract behind a selector does what its name suggests,
 * or whether signing is a good idea. Every report carries that caveat as data,
 * not as a footnote, so a UI cannot render a green checkmark from it.
 *
 * Everything here is offline. No chain is read, no token metadata is fetched,
 * no simulation runs, and no payload survives the request that carried it.
 */
import { z } from "zod";

export const SIGNING_SCHEMA_VERSION = "signing-inspector/2026-01" as const;

/**
 * Published bounds, enforced *before* parsing rather than during it. A payload
 * is rejected on size and shape first, so a hostile input cannot spend the
 * server's time proving it is hostile.
 */
export const SIGNING_LIMITS = {
  maxRequestBytes: 262_144,
  /** Characters of hex calldata or base64 XDR accepted. */
  maxPayloadChars: 65_536,
  /** Nesting depth allowed in typed data before it is refused. */
  maxTypedDataDepth: 8,
  /** Total nodes allowed in a typed-data document. */
  maxTypedDataNodes: 2_048,
  /** Operations decoded from one Stellar envelope. */
  maxOperations: 100,
  /** Distinct types allowed in an EIP-712 type table. */
  maxTypedDataTypes: 64,
} as const;

/** The maximum uint256, the conventional "unlimited allowance" value. */
export const MAX_UINT256 = (2n ** 256n - 1n).toString();

/** Selectors this inspector is willing to name. Anything else stays unknown. */
export const ALLOWLISTED_SELECTORS = {
  "0xa9059cbb": { name: "transfer", signature: "transfer(address,uint256)", args: ["address", "uint256"] },
  "0x095ea7b3": { name: "approve", signature: "approve(address,uint256)", args: ["address", "uint256"] },
  "0x23b872dd": { name: "transferFrom", signature: "transferFrom(address,address,uint256)", args: ["address", "address", "uint256"] },
  "0x39509351": { name: "increaseAllowance", signature: "increaseAllowance(address,uint256)", args: ["address", "uint256"] },
  "0xa457c2d7": { name: "decreaseAllowance", signature: "decreaseAllowance(address,uint256)", args: ["address", "uint256"] },
} as const;

export type AllowlistedSelector = keyof typeof ALLOWLISTED_SELECTORS;

export type PermissionKind =
  | "token_transfer"
  | "token_approval"
  | "permit_approval"
  | "transfer_from"
  | "allowance_increase"
  | "allowance_decrease"
  | "stellar_payment"
  | "stellar_trustline"
  | "stellar_account_change"
  | "unknown";

export type DeadlineInfo = {
  unixSeconds: string;
  iso: string | null;
  /** Compared against the caller-supplied evaluation time, never a server clock. */
  expired: boolean;
};

/**
 * One thing the payload asks for.
 *
 * `rawProvenance` names the byte range, field path or operation index the
 * values came from. Without it a permission row is an assertion; with it, a
 * reader can check it against the raw payload shown alongside.
 */
export type Permission = {
  permissionId: string;
  kind: PermissionKind;
  /** Who gains the ability to move funds, when the payload names one. */
  spender: string | null;
  /** Who receives, when the payload names one. */
  recipient: string | null;
  /** The contract or asset the permission applies to. */
  subject: string | null;
  /** Base units exactly as encoded. Decimals are not known offline. */
  amountRaw: string | null;
  /** True only for the conventional unlimited value. */
  isUnlimited: boolean;
  deadline: DeadlineInfo | null;
  rawProvenance: string;
  /** What this permission would allow if signed. Never a safety verdict. */
  consequence: string;
};

export type DecodedOperation = {
  index: number;
  type: string;
  /** False when the operation is preserved but not interpreted. */
  supported: boolean;
  summary: string;
  fields: Array<{ label: string; value: string }>;
};

/**
 * A field the inspector saw but did not interpret.
 *
 * These are surfaced, never dropped. A payload whose unknown parts are hidden
 * reads as fully understood, which is exactly the impression this feature
 * exists to prevent.
 */
export type UnknownField = {
  location: string;
  description: string;
  raw: string;
};

export type BindingState = "match" | "mismatch" | "not_bound" | "not_checked";

/**
 * Whether the payload is bound to the context the user expects.
 *
 * `not_bound` is its own state and is important: a Stellar envelope carries no
 * network identifier at all, so a signature over it is only network-specific
 * because of the passphrase the *signer* mixes in. Reporting that as "match"
 * would be a lie; reporting it as "mismatch" would be alarmism.
 */
export type ContextBinding = {
  field: "account" | "evm_chain_id" | "verifying_contract" | "stellar_network" | "domain_name";
  expected: string | null;
  observed: string | null;
  state: BindingState;
  note: string;
};

export type SigningCoverage = {
  state: "complete" | "partial" | "empty" | "unavailable";
  note: string;
  decodedFieldCount: number;
  unknownFieldCount: number;
};

export type SigningReport = {
  schemaVersion: typeof SIGNING_SCHEMA_VERSION;
  /** The caller's evaluation time. Deadlines are compared against this. */
  evaluatedAt: string;
  payloadKind: "evm_calldata" | "evm_typed_data" | "stellar_envelope";
  /** A short, honest description of what the payload is. */
  summary: string;
  permissions: Permission[];
  operations: DecodedOperation[];
  unknownFields: UnknownField[];
  contextBinding: ContextBinding[];
  coverage: SigningCoverage;
  /** Decoded syntax is not proof of safety. Carried as data so a UI must show it. */
  decodingIsNotApproval: true;
  /** This feature never signs, broadcasts or retains a payload. */
  readOnly: true;
};

const evmAddress = z
  .string()
  .trim()
  .refine((value) => /^0x[0-9a-fA-F]{40}$/.test(value), { message: "A 20-byte EVM address is required." });

/**
 * Size is deliberately not enforced here.
 *
 * `assertWithinPayloadSize` checks it instead, so an oversized payload comes
 * back as `payload_too_large` with the published limit rather than as a
 * generic validation failure. The total request is already bounded by
 * `maxRequestBytes` at the route, so nothing unbounded reaches this point.
 */
const hexData = z
  .string()
  .trim()
  .refine((value) => /^0x[0-9a-fA-F]*$/.test(value), { message: "Calldata must be hex." });

const evmCalldataPayload = z.object({
  kind: z.literal("evm_calldata"),
  /** The contract the calldata would be sent to, when the caller knows it. */
  to: evmAddress.optional(),
  data: hexData,
  /** Native value in wei, as a decimal string. */
  value: z.string().trim().max(80).optional(),
  chainId: z.number().int().positive().max(2 ** 53 - 1).optional(),
});

const typedDataPayload = z.object({
  kind: z.literal("evm_typed_data"),
  /** Accepted as unknown and walked defensively; never trusted to be shaped. */
  typedData: z.unknown(),
});

const stellarEnvelopePayload = z.object({
  kind: z.literal("stellar_envelope"),
  /** Size is checked by `assertWithinPayloadSize`, so oversize reads as 413. */
  xdr: z.string().trim().min(1),
  /**
   * The passphrase the caller intends to sign under. It is *not* read from the
   * envelope, because an envelope does not carry one.
   */
  networkPassphrase: z.string().trim().max(200).optional(),
});

export const signingRequestSchema = z.object({
  /** Caller-supplied clock. A deadline is never compared to the server's time. */
  evaluatedAt: z.string().datetime({ offset: true }),
  expected: z
    .object({
      account: z.string().trim().max(80).optional(),
      evmChainId: z.number().int().positive().max(2 ** 53 - 1).optional(),
      stellarNetworkPassphrase: z.string().trim().max(200).optional(),
      verifyingContract: evmAddress.optional(),
    })
    .default({}),
  payload: z.discriminatedUnion("kind", [evmCalldataPayload, typedDataPayload, stellarEnvelopePayload]),
});

export type SigningRequest = z.infer<typeof signingRequestSchema>;

export class SigningInspectorError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "SigningInspectorError";
    this.code = code;
    this.details = details;
  }
}
