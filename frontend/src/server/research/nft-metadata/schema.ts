import { isAddress } from "viem";
import { z } from "zod";
import { isSupportedNftNetwork } from "./chainIdentity";
import type { NftMetadataState } from "./errors";
import type { HostingClassification } from "./hostingClassifier";
import type { MutabilityResult } from "./mutability";
import type { SafeNftMetadata } from "./safeMetadata";
import type { DetectedStandard, StandardDetectionResult } from "./standardDetection";
import { MAX_SAMPLE_TOKEN_IDS } from "./limits";

const tokenIdSchema = z.string().regex(/^(0|[1-9]\d*)$/, "Must be a non-negative integer token ID");

export const nftMetadataRequestSchema = z
  .object({
    walletAddress: z.string().refine(isAddress, "Invalid wallet"),
    network: z.string().refine(isSupportedNftNetwork, "Unsupported network"),
    walletNetwork: z.string(),
    contractAddress: z.string().refine(isAddress, "Invalid collection address"),
    /** Token IDs to sample metadata for; defaults to a small fixed sample when omitted. */
    tokenIds: z.array(tokenIdSchema).max(MAX_SAMPLE_TOKEN_IDS).optional(),
    blockNumber: z.number().int().positive().optional(),
  })
  .refine((v) => v.network === v.walletNetwork, {
    message: "Network mismatch",
    path: ["network"],
  });

export type NftMetadataRequest = z.infer<typeof nftMetadataRequestSchema>;

export type MetadataResolutionResult = {
  uri: string | null;
  hosting: HostingClassification | null;
  resolved: boolean;
  reason: string;
  metadata: SafeNftMetadata | null;
  media: { uri: string; hosting: HostingClassification; resolved: boolean; reason: string } | null;
};

export type TokenSample = {
  tokenId: string;
  uri: string | null;
  resolution: MetadataResolutionResult;
};

export type CoverageNotice = {
  standardDetected: boolean;
  sampledTokens: number;
  resolvedSamples: number;
  metadataUpdateScanTruncated: boolean;
};

export type NftMetadataResult = {
  network: string;
  contractAddress: string;
  state: NftMetadataState;
  standard: DetectedStandard;
  standardDetection: StandardDetectionResult;
  contractUri: MetadataResolutionResult;
  samples: TokenSample[];
  mutability: MutabilityResult;
  coverage: CoverageNotice;
  warnings: string[];
};
