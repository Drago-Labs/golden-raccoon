/**
 * Versioned contract for proxy implementation and upgrade authority inspection.
 *
 * The line this feature refuses to cross: absence of evidence is never
 * evidence of absence. A contract with no admin slot is not "immutable" — it
 * is a contract whose authority this inspector could not observe, and the
 * report says exactly that. Every conclusion below carries the code read,
 * storage slot or call result that produced it, together with the block it was
 * read at, so a reader can re-derive it rather than trust it.
 */
import { z } from "zod";

export const PROXY_SCHEMA_VERSION = "proxy-inspector/2026-01" as const;

/**
 * Published bounds. These are part of the contract: a caller can rely on the
 * inspector never issuing more reads than `maxRpcCalls`, and never following
 * indirection deeper than `maxDepth` before reporting the chain as truncated.
 */
export const PROXY_LIMITS = {
  /** Hops of implementation indirection followed before truncation. */
  maxDepth: 6,
  /** Hard ceiling on reads per inspection, enforced by the reader budget. */
  maxRpcCalls: 48,
  maxRequestBytes: 16_384,
  /** Bytes of code retained per address as evidence. */
  maxCodePreviewBytes: 32,
} as const;

/**
 * Standardized storage slots. Each carries the standard that defines it, so a
 * value found here is reported as "the ERC-1967 implementation slot held X",
 * not as "the implementation is X".
 */
export const STANDARD_SLOTS = {
  erc1967Implementation: {
    slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    standard: "ERC-1967",
    role: "implementation",
    label: "ERC-1967 implementation slot",
  },
  erc1967Admin: {
    slot: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
    standard: "ERC-1967",
    role: "admin",
    label: "ERC-1967 admin slot",
  },
  erc1967Beacon: {
    slot: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
    standard: "ERC-1967",
    role: "beacon",
    label: "ERC-1967 beacon slot",
  },
  legacyZeppelinImplementation: {
    slot: "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3",
    standard: "OpenZeppelin legacy",
    role: "implementation",
    label: "Legacy OpenZeppelin implementation slot",
  },
  eip1822Proxiable: {
    slot: "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7",
    standard: "EIP-1822",
    role: "implementation",
    label: "EIP-1822 proxiable slot",
  },
} as const;

export type StandardSlotKey = keyof typeof STANDARD_SLOTS;

/** `implementation()` on an ERC-1967 beacon. */
export const BEACON_IMPLEMENTATION_SELECTOR = "0x5c60da1b";

/**
 * An address is never a bare string in this report. It is always scoped to the
 * network it was read on, because the same 20 bytes on two chains are two
 * different contracts.
 */
export type ScopedAddress = {
  network: string;
  chainId: number | null;
  address: string;
};

/** What a single storage read saw, kept as raw evidence. */
export type SlotObservation = {
  slotKey: StandardSlotKey;
  slot: string;
  label: string;
  standard: string;
  /** Raw 32-byte word, or null when the read itself failed. */
  rawValue: string | null;
  /** Address decoded from the low 20 bytes, when the word is address-shaped. */
  decodedAddress: string | null;
  /** True when the word is all zeroes: the slot exists but holds nothing. */
  isZero: boolean;
  /**
   * True when the upper 12 bytes are non-zero, so the word is not a clean
   * address. A dirty word is reported, never silently truncated.
   */
  isDirty: boolean;
  /** Set when the read could not be completed. */
  unavailableReason: string | null;
};

export type CodeObservation = {
  target: ScopedAddress;
  /** False means the address held no code at the checked block: an EOA. */
  hasCode: boolean;
  codeSizeBytes: number | null;
  /** First bytes of the runtime code, as evidence the read happened. */
  codePreview: string | null;
  unavailableReason: string | null;
};

export type ImplementationHop = {
  depth: number;
  /** The address whose storage or code produced this hop. */
  from: ScopedAddress;
  to: ScopedAddress | null;
  kind: "erc1967_direct" | "legacy_slot" | "beacon" | "truncated" | "cycle" | "unresolved";
  /** The observation this hop rests on, named so a reader can re-read it. */
  evidence: string;
  code: CodeObservation | null;
};

export type AuthorityKind =
  | "observed_admin_slot"
  | "observed_beacon_owner"
  | "not_observed";

/**
 * Observed authority is kept strictly apart from inferred control. The
 * inspector reports the first and declines the second: an admin slot value is
 * an observation, "who can upgrade this" is a conclusion it cannot reach from
 * storage alone.
 */
export type AuthorityEvidence = {
  kind: AuthorityKind;
  holder: ScopedAddress | null;
  /** Whether the holder itself has code, when that was readable. */
  holderHasCode: boolean | null;
  evidence: string;
  /** What this observation does not establish. Never empty. */
  limitation: string;
};

export type ProxyClassification =
  | "not_a_contract"
  | "no_proxy_indirection_observed"
  | "erc1967_direct_proxy"
  | "erc1967_beacon_proxy"
  | "legacy_slot_proxy"
  | "conflicting_slots"
  | "cyclic_indirection"
  | "unsupported_proxy_pattern"
  | "unavailable";

export type ProxyFinding = {
  findingId: string;
  severity: "informational" | "attention";
  statement: string;
  /** The observation behind the statement. Never a bare assertion. */
  evidence: string;
  limitation: string;
};

export type InspectionCoverage = {
  state: "complete" | "partial" | "unavailable" | "empty";
  note: string;
  /** Reads actually issued, against the published ceiling. */
  rpcCallsUsed: number;
  rpcCallBudget: number;
  /** Reads that failed, so a partial answer is never read as a complete one. */
  failedReadCount: number;
};

export type ProxyInspectionReport = {
  schemaVersion: typeof PROXY_SCHEMA_VERSION;
  /** Every read in this report was taken at this block, not at "now". */
  checkedAtBlock: string;
  checkedAtBlockNumber: number | null;
  network: string;
  chainId: number | null;
  target: ScopedAddress;
  classification: ProxyClassification;
  /** Human-readable summary that repeats the classification's caveat. */
  summary: string;
  targetCode: CodeObservation;
  slots: SlotObservation[];
  path: ImplementationHop[];
  authority: AuthorityEvidence[];
  findings: ProxyFinding[];
  coverage: InspectionCoverage;
  /** This feature writes nothing and rewrites no existing risk score. */
  readOnly: true;
  scoreUnchanged: true;
};

const addressPattern = /^0x[0-9a-fA-F]{40}$/;

export const proxyInspectionRequestSchema = z.object({
  network: z.string().trim().min(1).max(40),
  address: z
    .string()
    .trim()
    .refine((value) => addressPattern.test(value), { message: "An EVM address of 20 bytes is required." }),
  /** "latest" is resolved to a concrete block before any read, so the report cites one block. */
  block: z
    .union([z.literal("latest"), z.string().trim().regex(/^0x[0-9a-fA-F]{1,16}$/)])
    .default("latest"),
});

export type ProxyInspectionRequest = z.infer<typeof proxyInspectionRequestSchema>;

export class ProxyInspectorError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ProxyInspectorError";
    this.code = code;
    this.details = details;
  }
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * The read port this feature needs from a chain.
 *
 * It is declared here, with the contract, because every method is a *read*.
 * There is deliberately no `sendTransaction`, no `eth_sendRawTransaction` and
 * no signer: the inspector physically cannot perform an upgrade or change an
 * admin, and that guarantee is enforced by this type rather than by review.
 *
 * A failed read rejects with an error; the caller records it as an
 * unavailable observation instead of letting it collapse the whole report.
 */
export type ChainReader = {
  /** Latest block number, as a hex quantity. */
  getBlockNumber(): Promise<string>;
  /** Runtime code at an address, as a hex string ("0x" for an EOA). */
  getCode(address: string, block: string): Promise<string>;
  /** A single 32-byte storage word. */
  getStorageAt(address: string, slot: string, block: string): Promise<string>;
  /** A read-only `eth_call`. Rejects when the call reverts. */
  call(to: string, data: string, block: string): Promise<string>;
};
