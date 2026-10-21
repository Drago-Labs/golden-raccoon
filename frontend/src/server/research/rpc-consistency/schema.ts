/**
 * Versioned contract for a read-only Horizon / Stellar RPC comparison.
 *
 * The check asks both providers about one account or one contract on one
 * network. It records the ledger each answer came from. It does not submit
 * transactions, and it does not score providers.
 */
import { z } from "zod";
import { CONSISTENCY_LIMITS } from "./limits";

export const CONSISTENCY_SCHEMA_VERSION = "rpc-consistency/2026-10" as const;

export type NetworkId = "testnet" | "mainnet";
export type ProviderName = "horizon" | "rpc";
export type TargetKind = "account" | "contract";
export type FieldKind = "native_balance" | "sequence" | "trustline" | "contract_data";
export type FieldClassification = "matched" | "lagging" | "conflicting" | "single_source";

export type TrustlineHint = {
  code: string;
  issuer: string;
};

export type ProbeTarget = {
  network: NetworkId;
  horizonUrl: string;
  rpcUrl: string;
  passphrase: string;
  kind: TargetKind;
  id: string;
  trustlines: TrustlineHint[];
  contractDataKeys: string[];
};

export type HorizonTrustline = {
  code: string;
  issuer: string;
  /** Decimal string, as Horizon printed it. */
  balance: string | null;
  limit: string | null;
  raw: unknown;
};

export type HorizonAccount = {
  /** `last_modified_ledger` of the account document. Horizon does not stamp each balance. */
  ledger: number | null;
  sequence: string | null;
  /** Decimal XLM string. */
  nativeBalance: string | null;
  nativeRaw: unknown;
  trustlines: HorizonTrustline[];
  raw: unknown;
};

export type RpcTrustline = {
  code: string;
  issuer: string;
  balanceStroops: string | null;
  limitStroops: string | null;
  ledger: number | null;
  raw: unknown;
};

export type RpcAccount = {
  ledger: number | null;
  sequence: string | null;
  nativeBalanceStroops: string | null;
  raw: unknown;
  trustlines: RpcTrustline[];
};

export type ContractDataEntry = {
  key: string;
  /** Canonical text of the entry value. */
  value: string | null;
  ledger: number | null;
  raw: unknown;
};

/**
 * What one provider actually returned.
 *
 * `contractDataExposed` is false when that provider has no contract-data
 * surface. Horizon is in that category today; the field stays so a recorded
 * Horizon equivalent can still be compared.
 */
export type ProviderObservation = {
  provider: ProviderName;
  network: NetworkId;
  endpoint: string;
  passphrase: string | null;
  latestLedger: number | null;
  retentionStartLedger: number | null;
  retentionEndLedger: number | null;
  notFound: boolean;
  account: HorizonAccount | RpcAccount | null;
  contractDataExposed: boolean;
  contractEntries: ContractDataEntry[];
  /** Trustlines left unread because they exceeded the published bound. */
  omittedTrustlines: number;
  /** Ledger keys left unread because they exceeded the page bound. */
  omittedLedgerKeys: number;
};

export type HorizonObservation = ProviderObservation & {
  provider: "horizon";
  account: HorizonAccount | null;
};

export type RpcObservation = ProviderObservation & {
  provider: "rpc";
  account: RpcAccount | null;
};

export type FieldSide = {
  ledger: number | null;
  /** Canonical comparable text. Null when this side has no answer. */
  value: string | null;
  raw: unknown;
};

export type NormalizedField = {
  fieldId: string;
  kind: FieldKind;
  label: string;
  horizon: FieldSide | null;
  rpc: FieldSide | null;
};

export type FieldComparison = {
  fieldId: string;
  kind: FieldKind;
  label: string;
  classification: FieldClassification;
  horizon: FieldSide | null;
  rpc: FieldSide | null;
  /** Present only when both sides answered at the same ledger with different values. */
  conflict: { horizonRaw: unknown; rpcRaw: unknown } | null;
  note: string;
};

export type ProviderStatus = {
  provider: ProviderName;
  availability: "available" | "unavailable";
  label: string;
  latestLedger: number | null;
  retentionStartLedger: number | null;
  retentionEndLedger: number | null;
  network: NetworkId;
  endpoint: string;
  detail: string;
};

export type LagSummary = {
  laggingFieldCount: number;
  largestFieldGap: number | null;
  trailingProvider: ProviderName | null;
  providerLedgerGap: number | null;
  note: string;
};

export type CoverageNotice = {
  state: "complete" | "partial" | "single_source" | "unavailable";
  note: string;
  fieldCount: number;
  matchedCount: number;
  laggingCount: number;
  conflictingCount: number;
  singleSourceCount: number;
  horizonContractDataExposed: boolean;
  omittedTrustlines: number;
  omittedLedgerKeys: number;
};

export type ConsistencyReport = {
  schemaVersion: typeof CONSISTENCY_SCHEMA_VERSION;
  network: NetworkId;
  target: { kind: TargetKind; id: string };
  providers: ProviderStatus[];
  fields: FieldComparison[];
  lag: LagSummary;
  coverage: CoverageNotice;
  /** This check only reads. It never submits. */
  readOnly: true;
};

const trustlineHintSchema = z.object({
  code: z.string().trim().min(1).max(12),
  issuer: z.string().trim().min(56).max(56),
});

export const consistencyRequestSchema = z.object({
  network: z.enum(["testnet", "mainnet"]),
  target: z.string().trim().min(1).max(CONSISTENCY_LIMITS.maxTargetLength),
  trustlines: z.array(trustlineHintSchema).max(CONSISTENCY_LIMITS.maxTrustlines).default([]),
  contractDataKeys: z
    .array(z.string().trim().min(1).max(CONSISTENCY_LIMITS.maxKeyLength))
    .max(CONSISTENCY_LIMITS.maxContractKeys)
    .default([]),
});

export type ConsistencyRequest = z.infer<typeof consistencyRequestSchema>;
