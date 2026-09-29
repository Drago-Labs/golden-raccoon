import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Expected an EVM address");

export const allowancePairSchema = z.object({
  token: address,
  spender: address,
});

export const allowanceInventoryRequestSchema = z.object({
  walletAddress: address.optional(),
  network: z.enum(["goat", "ethereum", "base", "bsc", "arbitrum", "polygon", "optimism", "avalanche"]),
  fromBlock: z.coerce.bigint().nonnegative(),
  toBlock: z.coerce.bigint().nonnegative().optional(),
  pairs: z.array(allowancePairSchema).max(50).default([]),
}).superRefine((value, context) => {
  if (value.toBlock !== undefined && value.toBlock < value.fromBlock) {
    context.addIssue({ code: "custom", path: ["toBlock"], message: "toBlock must be greater than or equal to fromBlock" });
  }
  if (value.toBlock !== undefined && value.toBlock - value.fromBlock > 10_000n) {
    context.addIssue({ code: "custom", path: ["toBlock"], message: "Scan ranges are limited to 10,000 blocks" });
  }
});

export type AllowancePair = z.infer<typeof allowancePairSchema>;
export type AllowanceInventoryRequest = z.infer<typeof allowanceInventoryRequestSchema>;

export type InventoryState = "complete" | "partial" | "unavailable";
export type AllowanceKind = "revoked" | "finite" | "maximum" | "unknown";

export type InventoryEntry = {
  token: string;
  spender: string;
  allowance: string | null;
  allowanceKind: AllowanceKind;
  symbol: string | null;
  decimals: number | null;
  balance: string | null;
  knownBalanceExposure: string | null;
  source: "logs" | "explicit" | "both";
  warnings: string[];
};

export type SpenderGroup = {
  spender: string;
  activeCount: number;
  revokedCount: number;
  entries: InventoryEntry[];
};

export type DiscoveryCoverage = {
  state: InventoryState;
  fromBlock: string;
  toBlock: string | null;
  snapshotBlock: string | null;
  candidateCount: number;
  successfulReads: number;
  skippedCalls: number;
  logCoverageComplete: boolean;
  reorgDetected: boolean;
  providerLimitations: string[];
  unsupportedStandards: string[];
  message: string;
};

export type AllowanceInventoryResult = {
  walletAddress: string;
  network: string;
  generatedAt: string;
  state: InventoryState;
  entries: InventoryEntry[];
  spenderGroups: SpenderGroup[];
  coverage: DiscoveryCoverage;
};
