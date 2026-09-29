/**
 * Versioned contract for the metadata-integrity inspector.
 *
 * The line this feature refuses to cross: **a TOML file is evidence of a
 * declaration, not proof of domain ownership, legitimacy, or fraud.** A
 * matching currency entry means the document named this asset and issuer
 * together. It does not mean the domain is controlled by that issuer, and a
 * change between two observations is reported as a change — never as fraud.
 */
import { z } from "zod";

export const METADATA_SCHEMA_VERSION = "metadata-integrity/2026-01" as const;

export const METADATA_LIMITS = {
  maxRequestBytes: 524_288,
  maxTomlBytes: 250_000,
  maxRedirects: 3,
  fetchTimeoutMs: 5_000,
  maxPriorObservations: 50,
  maxObservationFieldChars: 4_096,
} as const;

export type StellarNetworkShort = "testnet" | "pubnet";

/**
 * How a declaration compared to the requested asset code + issuer.
 *
 * `expired` is reserved for a currency that names `status = "dead"` (or an
 * equivalent retired marker) while still matching code+issuer. `unreachable`
 * covers every fetch failure that prevented comparison.
 */
export type DeclarationStatus =
  | "matched"
  | "absent"
  | "conflicting"
  | "expired"
  | "unreachable";

export type TomlFetchOutcome =
  | "ok"
  | "redirect_blocked"
  | "tls_or_https_required"
  | "private_or_local_target"
  | "oversized"
  | "timeout"
  | "malformed"
  | "http_error"
  | "dns_failure"
  | "missing_home_domain";

export type ObservationFieldKey =
  | "name"
  | "description"
  | "orgUrl"
  | "image"
  | "status"
  | "code"
  | "issuer"
  | "homeDomain"
  | "tomlUrl";

export type MetadataSnapshot = {
  name: string | null;
  description: string | null;
  orgUrl: string | null;
  image: string | null;
  status: string | null;
  code: string | null;
  issuer: string | null;
  homeDomain: string | null;
  tomlUrl: string | null;
};

export type MetadataObservation = {
  observationId: string;
  observedAt: string;
  /** SHA-256 of the normalized snapshot JSON. */
  contentHash: string;
  identityKey: string;
  network: StellarNetworkShort;
  assetCode: string;
  issuer: string;
  /** Ledger / Horizon sequence reference for the issuer account when known. */
  issuerLedgerRef: {
    sequence: string | null;
    lastModifiedLedger: number | null;
    accountUrl: string | null;
  };
  declarationStatus: DeclarationStatus;
  fetchOutcome: TomlFetchOutcome;
  exactLinks: {
    stellarTomlUrl: string | null;
    orgUrl: string | null;
    imageUrl: string | null;
  };
  snapshot: MetadataSnapshot;
  /** Explicit caveat so UIs cannot claim ownership from TOML alone. */
  domainOwnershipClaimed: false;
  notes: string[];
};

export type ObservationDiffRow = {
  field: ObservationFieldKey;
  previous: string | null;
  current: string | null;
  changed: boolean;
};

export type ObservationDiff = {
  fromObservationId: string;
  toObservationId: string;
  fromObservedAt: string;
  toObservedAt: string;
  rows: ObservationDiffRow[];
  /** Always true: a diff is an observation of change, not a fraud verdict. */
  changeIsObservationNotFraud: true;
};

export type IssuerAccountEvidence = {
  accountId: string;
  homeDomain: string | null;
  sequence: string | null;
  lastModifiedLedger: number | null;
  horizonAccountUrl: string | null;
  found: boolean;
  issues: string[];
};

export type TomlFetchEvidence = {
  requestedUrl: string | null;
  finalUrl: string | null;
  outcome: TomlFetchOutcome;
  httpStatus: number | null;
  redirectCount: number;
  contentType: string | null;
  byteLength: number | null;
  tlsRequiredHonoured: boolean;
  issues: string[];
};

export type MetadataIntegrityReport = {
  schemaVersion: typeof METADATA_SCHEMA_VERSION;
  evaluatedAt: string;
  identityKey: string;
  network: StellarNetworkShort;
  assetCode: string;
  issuer: string;
  issuerAccount: IssuerAccountEvidence;
  tomlFetch: TomlFetchEvidence;
  declarationStatus: DeclarationStatus;
  currentObservation: MetadataObservation;
  timeline: MetadataObservation[];
  diffs: ObservationDiff[];
  coverage: {
    state: "complete" | "partial" | "empty" | "unavailable";
    note: string;
  };
  /** Hard-coded so no code path can invent a legitimacy verdict. */
  legitimacyVerdict: null;
  domainOwnershipClaimed: false;
  changeIsObservationNotFraud: true;
  readOnly: true;
};

export const priorObservationSchema = z.object({
  observationId: z.string().min(1).max(128),
  observedAt: z.string().datetime(),
  contentHash: z.string().min(8).max(128),
  identityKey: z.string().min(1).max(256),
  network: z.enum(["testnet", "pubnet"]),
  assetCode: z.string().min(1).max(12),
  issuer: z.string().min(56).max(56),
  issuerLedgerRef: z.object({
    sequence: z.string().nullable(),
    lastModifiedLedger: z.number().int().nullable(),
    accountUrl: z.string().nullable(),
  }),
  declarationStatus: z.enum(["matched", "absent", "conflicting", "expired", "unreachable"]),
  fetchOutcome: z.enum([
    "ok",
    "redirect_blocked",
    "tls_or_https_required",
    "private_or_local_target",
    "oversized",
    "timeout",
    "malformed",
    "http_error",
    "dns_failure",
    "missing_home_domain",
  ]),
  exactLinks: z.object({
    stellarTomlUrl: z.string().nullable(),
    orgUrl: z.string().nullable(),
    imageUrl: z.string().nullable(),
  }),
  snapshot: z.object({
    name: z.string().nullable(),
    description: z.string().nullable(),
    orgUrl: z.string().nullable(),
    image: z.string().nullable(),
    status: z.string().nullable(),
    code: z.string().nullable(),
    issuer: z.string().nullable(),
    homeDomain: z.string().nullable(),
    tomlUrl: z.string().nullable(),
  }),
  domainOwnershipClaimed: z.literal(false),
  notes: z.array(z.string().max(METADATA_LIMITS.maxObservationFieldChars)).max(32),
});

export const metadataIntegrityRequestSchema = z.object({
  assetCode: z.string().min(1).max(12),
  issuer: z.string().min(56).max(56),
  network: z.enum(["testnet", "pubnet", "stellar-testnet", "stellar-pubnet"]),
  /** Optional override when the caller already knows the home domain. */
  homeDomain: z.string().min(1).max(253).optional(),
  evaluatedAt: z.string().datetime().optional(),
  priorObservations: z.array(priorObservationSchema).max(METADATA_LIMITS.maxPriorObservations).optional(),
});

export type MetadataIntegrityRequest = z.infer<typeof metadataIntegrityRequestSchema>;

export class MetadataIntegrityError extends Error {
  constructor(
    readonly code:
      | "invalid_request"
      | "invalid_issuer"
      | "invalid_asset_code"
      | "invalid_network"
      | "payload_too_large",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "MetadataIntegrityError";
  }
}

export type IssuerAccountReader = (input: {
  issuer: string;
  network: StellarNetworkShort;
}) => Promise<{
  homeDomain: string | null;
  sequence: string | null;
  lastModifiedLedger: number | null;
  found: boolean;
  issues: string[];
}>;

export type TomlFetchResult = {
  outcome: TomlFetchOutcome;
  requestedUrl: string;
  finalUrl: string | null;
  httpStatus: number | null;
  redirectCount: number;
  contentType: string | null;
  byteLength: number | null;
  body: string | null;
  issues: string[];
};

export type TomlFetcher = (input: {
  homeDomain: string;
}) => Promise<TomlFetchResult>;
