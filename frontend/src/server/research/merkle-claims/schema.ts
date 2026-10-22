import { isAddress } from "viem";
import { z } from "zod";
import { isSupportedMerkleNetwork } from "./chainIdentity";
import type { ClaimEligibility } from "./claimStatus";
import type { MerkleClaimsState } from "./errors";
import { LEAF_ENCODINGS, type LeafEncoding } from "./leafEncoding";

export const merkleClaimsRequestSchema = z
  .object({
    walletAddress: z.string().refine(isAddress, "Invalid wallet"),
    network: z.string().refine(isSupportedMerkleNetwork, "Unsupported network"),
    walletNetwork: z.string(),
    distributorAddress: z.string().refine(isAddress, "Invalid distributor address"),
    /** The address whose claim is being checked — not necessarily the connected wallet, since this is a public, read-only lookup. */
    claimAddress: z.string().refine(isAddress, "Invalid claim address"),
    /** An HTTPS URL, an `ipfs://` reference, or a bare IPFS CID for the published tree file. */
    treeSource: z.string().min(1, "A tree source is required"),
    /** The leaf encoding this distributor uses. There is no safe default — the caller must say which one. */
    leafEncoding: z.enum(LEAF_ENCODINGS as [LeafEncoding, ...LeafEncoding[]]),
    blockNumber: z.number().int().positive().optional(),
  })
  .refine((v) => v.network === v.walletNetwork, {
    message: "Network mismatch",
    path: ["network"],
  });

export type MerkleClaimsRequest = z.infer<typeof merkleClaimsRequestSchema>;

export type CoverageNotice = {
  onChainRootRead: boolean;
  treeLoaded: boolean;
  proofChecked: boolean;
  claimStatusRead: boolean;
};

export type MerkleClaimsResult = {
  network: string;
  distributorAddress: string;
  claimAddress: string;
  state: MerkleClaimsState;
  onChainRoot: string | null;
  token: string | null;
  tree: {
    loaded: boolean;
    source: string;
    fileReportedRoot: string | null;
    entryIndex: number | null;
    entryAmount: string | null;
    proofLength: number | null;
  };
  proof: {
    leaf: string | null;
    computedRoot: string | null;
    valid: boolean;
    reason: string;
  };
  claim: ClaimEligibility;
  coverage: CoverageNotice;
  warnings: string[];
};
