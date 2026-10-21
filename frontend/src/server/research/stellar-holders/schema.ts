/**
 * Request and report contract for issued-asset holder distribution.
 *
 * The result key is `network|CODE|ISSUER`. Code and issuer alone are not an
 * identity: the same code from two issuers, or the same pair on two networks,
 * are different assets and must not share a report.
 */
import { z } from "zod";
import type { AnalysisState, HolderErrorCode } from "./errors";
import { HOLDER_LIMITS } from "./limits";

export const HOLDER_SCHEMA_VERSION = "stellar-holders/2026-01" as const;

export const STELLAR_HOLDER_NETWORKS = ["stellar-testnet", "stellar-pubnet"] as const;

export type StellarHolderNetwork = (typeof STELLAR_HOLDER_NETWORKS)[number];

export type ExactRatio = {
  numerator: string;
  denominator: string;
};

export type CanonicalAsset = {
  code: string;
  issuer: string;
  network: StellarHolderNetwork;
  /** `CODE:ISSUER`, with the code's original case preserved. */
  canonical: string;
  /** `network|CODE|ISSUER`. */
  resultKey: string;
};

export type HolderRole = "issuer" | "distribution" | "public";

export type HolderRow = {
  accountId: string;
  balance: string;
  baseUnits: string;
  role: HolderRole;
  shareOfAccounts: ExactRatio;
  /** Null for issuer and distribution accounts, which are outside the public float. */
  shareOfPublicFloat: ExactRatio | null;
};

export type SupplyBucketId = "trustlines" | "liquidity_pools" | "claimable_balances";

export type SupplyBucket = {
  id: SupplyBucketId;
  label: string;
  baseUnits: string;
  amount: string;
  shareOfIssued: ExactRatio;
};

export type NamedAmount = {
  id: string;
  amount: string;
  baseUnits: string;
};

export type SupplySnapshot = {
  ledger: number;
  ledgerClosedAt: string | null;
  issued: string;
  authorized: string;
  authorizedToMaintainLiabilities: string;
  unauthorized: string;
  liquidityPools: string;
  claimableBalances: string;
  contracts: string;
  numAccounts: number | null;
};

export type SupplyReport = {
  issued: string;
  issuedBaseUnits: string;
  contracts: string;
  contractsBaseUnits: string;
  buckets: SupplyBucket[];
  pools: NamedAmount[];
  claimables: NamedAmount[];
  snapshot: {
    authorized: string;
    authorizedToMaintainLiabilities: string;
    unauthorized: string;
    liquidityPools: string;
    claimableBalances: string;
    contracts: string;
  };
};

export type TopShare = {
  n: number;
  share: ExactRatio;
  baseUnits: string;
  amount: string;
};

export type ConcentrationReport = {
  defined: boolean;
  holderCount: number;
  totalBaseUnits: string;
  total: string;
  topShares: TopShare[];
  gini: ExactRatio;
  herfindahl: ExactRatio;
};

export type CoverageReport = {
  state: AnalysisState;
  coveredBaseUnits: string;
  covered: string;
  issuedBaseUnits: string;
  issued: string;
  fraction: ExactRatio;
  holdersSeen: number;
  pagesRead: number;
  truncated: boolean;
  duplicateCursor: boolean;
  note: string;
};

export type HolderDistributionReport = {
  schemaVersion: typeof HOLDER_SCHEMA_VERSION;
  state: AnalysisState;
  readOnly: true;
  network: StellarHolderNetwork | null;
  asset: CanonicalAsset | null;
  ledger: number | null;
  ledgerClosedAt: string | null;
  holders: HolderRow[];
  supply: SupplyReport | null;
  concentration: {
    accounts: ConcentrationReport;
    publicFloat: ConcentrationReport;
  } | null;
  issuerAdjacency: {
    issuer: string;
    distributionAccounts: string[];
    tomlRead: boolean;
  } | null;
  coverage: CoverageReport;
  error: { code: HolderErrorCode; message: string } | null;
};

export type TrustlineRecord = {
  accountId: string;
  balance: string;
};

export type TrustlinePage = {
  records: TrustlineRecord[];
  nextCursor: string | null;
};

/**
 * Read port. Every method observes Horizon or stellar.toml. None of them
 * submit a transaction.
 */
export type HolderDistributionReader = {
  readSupply(asset: CanonicalAsset): Promise<SupplySnapshot>;
  readTrustlinePage(asset: CanonicalAsset, cursor: string | null, limit: number): Promise<TrustlinePage>;
  readLiquidityPools(asset: CanonicalAsset): Promise<{ records: { id: string; amount: string }[]; truncated: boolean }>;
  readClaimableBalances(asset: CanonicalAsset): Promise<{ records: { id: string; amount: string }[]; truncated: boolean }>;
  readDistributionAccounts(asset: CanonicalAsset): Promise<{ accounts: string[]; tomlRead: boolean }>;
};

export const holderDistributionRequestSchema = z.object({
  asset: z.string().trim().min(1).max(80),
  network: z.string().trim().min(1).max(40),
  topN: z.number().int().min(1).max(HOLDER_LIMITS.maxTopN).optional(),
  maxPages: z.number().int().min(1).max(HOLDER_LIMITS.maxPages).optional(),
  pageSize: z.number().int().min(1).max(HOLDER_LIMITS.maxPageSize).optional(),
});

export type HolderDistributionRequest = z.infer<typeof holderDistributionRequestSchema>;
