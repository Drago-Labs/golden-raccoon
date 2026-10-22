import { isAddress } from "viem";
import { z } from "zod";
import { isSupportedDeployerNetwork } from "./chainIdentity";
import type { DeployerHistoryState } from "./errors";

export const deployerHistoryRequestSchema = z
  .object({
    walletAddress: z.string().refine(isAddress, "Invalid wallet"),
    network: z.string().refine(isSupportedDeployerNetwork, "Unsupported network"),
    walletNetwork: z.string(),
    /** The contract whose deployer this request profiles. */
    contractAddress: z.string().refine(isAddress, "Invalid contract address"),
  })
  .refine((v) => v.network === v.walletNetwork, {
    message: "Network mismatch",
    path: ["network"],
  });

export type DeployerHistoryRequest = z.infer<typeof deployerHistoryRequestSchema>;

export type DeployerLookup = {
  deployer: string | null;
  creationBlock: number | null;
  creationTxHash: string | null;
  /** `false` when the creation transaction's `to` was a contract (CREATE2/factory), not the reported deployer directly. */
  direct: boolean;
};

export type Deployment = {
  address: string;
  blockNumber: number;
  txHash: string;
  /** keccak256 of the deployed runtime bytecode, or `null` if the code could not be read. */
  codeHash: string | null;
};

export type TemplateGroup = {
  codeHash: string;
  deployments: string[];
};

export type FundingTransaction = {
  from: string;
  to: string;
  blockNumber: number;
  txHash: string;
  valueWei: string;
};

export type FundingHop = {
  hop: number;
  address: string;
  transactions: FundingTransaction[];
};

export type FlaggedMatch = {
  address: string;
  codeHash: string;
  /** Name of the configured list this hash was found in. */
  source: string;
  label: string;
};

export type ScanCoverage = {
  fromBlock: number;
  toBlock: number;
  truncated: boolean;
};

export type CoverageNotice = {
  deployerFound: boolean;
  deploymentScan: ScanCoverage | null;
  fundingHopsRequested: number;
  fundingHopsCompleted: number;
};

export type DeployerHistoryResult = {
  network: string;
  contractAddress: string;
  state: DeployerHistoryState;
  lookup: DeployerLookup;
  deployments: Deployment[];
  templateGroups: TemplateGroup[];
  fundingTrail: FundingHop[];
  flaggedMatches: FlaggedMatch[];
  coverage: CoverageNotice;
  warnings: string[];
};
