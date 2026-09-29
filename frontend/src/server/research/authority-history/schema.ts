/**
 * Versioned contract for read-only Ownable / AccessControl authority history.
 *
 * Two refusals define this feature.
 *
 * It will not **treat missing event history as proof that no authority
 * exists.** An empty timeline inside a bounded range is a coverage statement,
 * not an all-clear. Custom access models that do not emit the standard topics
 * are labelled unsupported rather than assumed absent.
 *
 * It will not **publish a reconstructed role matrix when the indexed range is
 * incomplete.** Grants and revokes only compose into current holders when
 * every block in the requested window was readable and its hash still matches.
 * A reorg or a missing block invalidates the affected reconstructed state.
 */
import { z } from "zod";

export const AUTHORITY_SCHEMA_VERSION = "authority-history/2026-01" as const;

export const AUTHORITY_LIMITS = {
  /** Inclusive block span accepted in one scan. */
  maxBlockSpan: 10_000n,
  /** Events retained and returned in one report. */
  maxEvents: 500,
  maxRequestBytes: 65_536,
} as const;

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Expected an EVM address");

export const EVM_NETWORKS = [
  "goat",
  "ethereum",
  "base",
  "bsc",
  "arbitrum",
  "polygon",
  "optimism",
  "avalanche",
] as const;

export const authorityHistoryRequestSchema = z
  .object({
    walletAddress: address.optional(),
    network: z.enum(EVM_NETWORKS),
    contractAddress: address,
    fromBlock: z.coerce.bigint().nonnegative(),
    toBlock: z.coerce.bigint().nonnegative().optional(),
  })
  .superRefine((value, context) => {
    if (value.toBlock !== undefined && value.toBlock < value.fromBlock) {
      context.addIssue({
        code: "custom",
        path: ["toBlock"],
        message: "toBlock must be greater than or equal to fromBlock",
      });
    }
    if (value.toBlock !== undefined && value.toBlock - value.fromBlock > AUTHORITY_LIMITS.maxBlockSpan) {
      context.addIssue({
        code: "custom",
        path: ["toBlock"],
        message: `Scan ranges are limited to ${AUTHORITY_LIMITS.maxBlockSpan} blocks`,
      });
    }
  });

export type AuthorityHistoryRequest = z.infer<typeof authorityHistoryRequestSchema>;

/** Which authority surface an event belongs to. */
export type AuthorityFamily = "application" | "proxy_admin";

export type AuthorityEventKind =
  | "OwnershipTransferred"
  | "RoleGranted"
  | "RoleRevoked"
  | "RoleAdminChanged"
  | "AdminChanged";

export type AuthorityEvent = {
  kind: AuthorityEventKind;
  family: AuthorityFamily;
  network: string;
  contractAddress: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  /** Explorer deep-link for the transaction, when the network is known. */
  transactionUrl: string | null;
  /** Ownable transfer endpoints, when applicable. */
  previousOwner: string | null;
  newOwner: string | null;
  /** AccessControl role id (bytes32 hex), when applicable. Exact, chain-scoped. */
  roleId: string | null;
  account: string | null;
  sender: string | null;
  previousAdminRole: string | null;
  newAdminRole: string | null;
  /** ERC-1967 proxy admin change endpoints. */
  previousAdmin: string | null;
  newAdmin: string | null;
};

export type RoleHolder = {
  roleId: string;
  account: string;
  family: AuthorityFamily;
  /** True only when the holder was derived from a complete indexed range. */
  reconstructed: boolean;
};

export type RoleAdmin = {
  roleId: string;
  adminRoleId: string;
  family: AuthorityFamily;
  reconstructed: boolean;
};

export type ObservedOwner = {
  address: string | null;
  family: AuthorityFamily;
  reconstructed: boolean;
  /** Source event that last set this owner inside the scanned range. */
  evidenceEventIndex: number | null;
};

/**
 * Coverage for the bounded scan.
 *
 * `complete` means every requested block was readable and hashes still match.
 * It does **not** mean the contract has no other authority outside the window
 * or under a custom access model.
 */
export type AuthorityCoverage = {
  state: "complete" | "partial" | "empty" | "unavailable";
  fromBlock: string;
  toBlock: string | null;
  snapshotBlock: string | null;
  eventCount: number;
  truncated: boolean;
  logCoverageComplete: boolean;
  reorgDetected: boolean;
  missingBlockHashes: number;
  unsupportedModels: string[];
  providerLimitations: string[];
  /**
   * True only when reconstructed holders/admins/owners may be shown as
   * derived state. False when gaps, reorgs, or missing hashes invalidate it.
   */
  reconstructionValid: boolean;
  message: string;
};

export type AuthorityHistoryReport = {
  schemaVersion: typeof AUTHORITY_SCHEMA_VERSION;
  walletAddress: string;
  network: string;
  contractAddress: string;
  generatedAt: string;
  events: AuthorityEvent[];
  /** Chronological view of the same events (oldest first). */
  timeline: AuthorityEvent[];
  roleMatrix: RoleHolder[];
  roleAdmins: RoleAdmin[];
  observedOwners: ObservedOwner[];
  coverage: AuthorityCoverage;
  /** This feature only reads logs; it never grants, revokes, or upgrades. */
  readOnly: true;
  authorityUnchanged: true;
};

export class AuthorityHistoryError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AuthorityHistoryError";
    this.code = code;
    this.details = details;
  }
}
