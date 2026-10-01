/**
 * Versioned contract for the reserve-attestation evidence workspace.
 *
 * Nothing here is fetched: the caller supplies a registry of permitted
 * asset+issuer identities and the reports it already holds. Reserve
 * attestations are evidence to inspect, not audited facts — a report is
 * never treated as more certain than the metadata attached to it.
 */
import { z } from "zod";

export const RESERVE_SCHEMA_VERSION = "reserve-attestation/2026-01" as const;

export const RESERVE_LIMITS = {
  maxRegistryEntries: 20,
  maxReportsPerEntry: 500,
  maxRequestBytes: 1_048_576,
  defaultLateAfterSeconds: 30 * 24 * 60 * 60,
} as const;

const decimalString = z.string().trim().regex(/^\d+(\.\d+)?$/, "Values are non-negative decimal strings.").max(40);
const sha256Hex = z.string().trim().regex(/^[0-9a-f]{64}$/i, "Document hash must be a 64-character hex SHA-256 digest.");

/** The explicit asset+issuer identity a report must match to be analysed at all. */
const registryEntrySchema = z.object({
  assetCode: z.string().trim().min(1).max(32),
  issuer: z.string().trim().min(1).max(160),
  /** Reports referencing a source label outside this list are still shown, but flagged as unlisted. */
  permittedSourceLabels: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
});

const reportSchema = z.object({
  assetCode: z.string().trim().min(1).max(32),
  issuer: z.string().trim().min(1).max(160),
  sourceType: z.enum(["issuer_statement", "independent_attestation"]),
  sourceLabel: z.string().trim().min(1).max(120),
  reportingPeriodStart: z.string().datetime({ offset: true }),
  reportingPeriodEnd: z.string().datetime({ offset: true }),
  retrievedAt: z.string().datetime({ offset: true }),
  documentUrl: z.string().trim().url().max(500),
  documentHash: sha256Hex,
  /** The prior revision's documentHash, when this report supersedes one already in the request. */
  revisionOf: sha256Hex.optional(),
  currency: z.string().trim().min(1).max(32),
  claimedAssets: decimalString,
  claimedLiabilities: decimalString,
});

export const reserveRequestSchema = z.object({
  windowStart: z.string().datetime({ offset: true }),
  windowEnd: z.string().datetime({ offset: true }),
  lateAfterSeconds: z.number().int().min(1).max(31_536_000).default(RESERVE_LIMITS.defaultLateAfterSeconds),
  registry: z.array(registryEntrySchema).min(1).max(RESERVE_LIMITS.maxRegistryEntries),
  reports: z.array(reportSchema).max(RESERVE_LIMITS.maxRegistryEntries * RESERVE_LIMITS.maxReportsPerEntry),
});

export type ReserveRequest = z.infer<typeof reserveRequestSchema>;
export type RegistryEntryInput = z.infer<typeof registryEntrySchema>;
export type ReportInput = z.infer<typeof reportSchema>;

export type ReportStatus = "on_time" | "late" | "unlisted_source";

export type EvidenceEntry = {
  documentHash: string;
  documentUrl: string;
  retrievedAt: string;
  sourceType: ReportInput["sourceType"];
  sourceLabel: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  status: ReportStatus;
  currency: string;
  claimedAssets: string;
  claimedLiabilities: string;
  /** Null whenever the ratio would require assuming something not in evidence. */
  coverageRatioBps: number | null;
  coverageNote: string;
  /** Documents this report explicitly supersedes, oldest first. */
  supersedes: string[];
  /** True when a later report in this same request supersedes this one. */
  superseded: boolean;
};

export type AssetIssuerAnalysis = {
  registryEntry: RegistryEntryInput;
  evidence: EvidenceEntry[];
  latestCoverageRatioBps: number | null;
  state: "complete" | "partial" | "no_evidence";
};

export type ReserveReport = {
  schemaVersion: typeof RESERVE_SCHEMA_VERSION;
  windowStart: string;
  windowEnd: string;
  assets: AssetIssuerAnalysis[];
  /** A report whose (assetCode, issuer) pair matches no registry entry: never attributed to a similarly-named one. */
  unregisteredReports: Array<{ assetCode: string; issuer: string; documentHash: string }>;
};

export class ReserveError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ReserveError";
    this.code = code;
    this.details = details;
  }
}
