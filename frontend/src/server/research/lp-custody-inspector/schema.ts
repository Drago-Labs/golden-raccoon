import { isAddress } from "viem";
import { z } from "zod";
import { getEvmNetwork } from "@/lib/evm/config";

/**
 * Addresses conventionally treated as unspendable. This is a community
 * convention, not a cryptographic guarantee — see custodyEvidence.ts.
 */
export const BURN_ADDRESSES = [
  "0x000000000000000000000000000000000000dead",
  "0x0000000000000000000000000000000000000000",
] as const;

export const MAX_CANDIDATES = 20;

export const candidateSchema = z.object({
  address: z.string().refine(isAddress, "Invalid candidate address"),
  label: z.string().max(80).optional(),
  /** Caller's claim about when a lock expires. Never independently verified here. */
  claimedUnlockTimestamp: z.number().int().positive().optional(),
});

export const lpCustodyRequestSchema = z
  .object({
    walletAddress: z.string().refine(isAddress, "Invalid wallet"),
    network: z.string().refine((v) => Boolean(getEvmNetwork(v)), "Unsupported network"),
    walletNetwork: z.string(),
    poolAddress: z.string().refine(isAddress, "Invalid pool address"),
    blockNumber: z.number().int().positive().optional(),
    candidates: z.array(candidateSchema).max(MAX_CANDIDATES).default([]),
  })
  .refine((v) => v.network === v.walletNetwork, { message: "Network mismatch", path: ["network"] });

export type LpCustodyRequest = z.infer<typeof lpCustodyRequestSchema>;
export type Candidate = z.infer<typeof candidateSchema>;

export type PoolModel = "constant_product_v2" | "concentrated_liquidity_unsupported" | "unknown_contract";

export type CandidateClassification = "burned" | "claimed_lock" | "unknown_holder";

export type LockClaimStatus = "claimed_future" | "claimed_past_or_expired" | "not_claimed";

export type CandidateEvidence = {
  address: string;
  label: string | null;
  classification: CandidateClassification;
  balanceRaw: string | null;
  basisPoints: number | null;
  lockClaim: {
    status: LockClaimStatus;
    unlockTimestamp: number | null;
    verified: false;
  };
  available: boolean;
};

export type CustodySummary = {
  /** Basis points (1/100 of a percent) of total supply, out of 10_000. */
  burnedBasisPoints: number;
  claimedLockedBasisPoints: number;
  otherIdentifiedBasisPoints: number;
  /** Supply this scan did not check at all: never treated as risk-free. */
  unaccountedBasisPoints: number;
};

export type LpCustodyResult = {
  network: string;
  poolAddress: string;
  blockNumber: number | null;
  state: "complete" | "partial" | "unavailable";
  model: PoolModel;
  token0: string | null;
  token1: string | null;
  reserves: { reserve0: string; reserve1: string; blockTimestampLast: number } | null;
  totalSupply: string | null;
  candidates: CandidateEvidence[];
  summary: CustodySummary | null;
  reorgDetected: boolean;
  warnings: string[];
};
