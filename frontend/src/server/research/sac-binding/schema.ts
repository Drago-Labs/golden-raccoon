import { z } from "zod";
import type { SacBindingState } from "./errors";
import { SUPPORTED_SAC_NETWORKS, type SacNetwork } from "./networkIdentity";

export const sacBindingRequestSchema = z
  .object({
    asset: z.string().trim().optional(),
    contractId: z.string().trim().optional(),
    network: z.enum(SUPPORTED_SAC_NETWORKS),
  })
  .refine((v) => Boolean(v.asset?.trim() || v.contractId?.trim()), {
    message: "Either classic asset or contractId must be provided",
    path: ["asset"],
  });

export type SacBindingRequest = z.infer<typeof sacBindingRequestSchema>;

export type ClassicAssetDescriptor = {
  assetType: "native" | "credit_alphanum4" | "credit_alphanum12";
  code: string;
  issuer: string | null;
  canonical: string;
};

export type DerivationStep = {
  step: number;
  label: string;
  value: string;
};

export type DerivedSacRecord = {
  asset: ClassicAssetDescriptor;
  network: SacNetwork;
  passphrase: string;
  expectedContractId: string;
  steps: DerivationStep[];
};

export type ContractInstanceSnapshot = {
  contractId: string;
  deployed: boolean;
  ledger: number;
  executableKind: "stellar_asset" | "wasm" | "missing";
  wasmHash: string | null;
  boundAssetCanonical: string | null;
  reportedMetadata: {
    name: string;
    symbol: string;
    decimals: number;
  } | null;
};

export type ExecutableClassification = {
  verdict: "genuine_sac" | "lookalike_wasm" | "undeployed_sac" | "address_mismatch";
  isGenuineSac: boolean;
  deployed: boolean;
  executableKind: "stellar_asset" | "wasm" | "missing";
  explanation: string;
};

export type MetadataFieldComparison = {
  field: "name" | "symbol" | "decimals";
  expected: string;
  reported: string | null;
  matches: boolean;
};

export type MetadataComparisonResult = {
  allMatch: boolean;
  fields: MetadataFieldComparison[];
};

export type CoverageNotice = {
  reachedProvider: boolean;
  ledger: number | null;
  instanceInspected: boolean;
  message: string;
};

export type SacBindingReport = {
  network: SacNetwork;
  state: SacBindingState;
  asset: ClassicAssetDescriptor | null;
  suppliedContractId: string | null;
  derivedContractId: string | null;
  derivation: DerivedSacRecord | null;
  instance: ContractInstanceSnapshot | null;
  classification: ExecutableClassification;
  metadataComparison: MetadataComparisonResult | null;
  coverage: CoverageNotice;
  warnings: string[];
};
