import { z } from "zod";

export const RULE_SCHEMA_VERSION_V1 = 1 as const;

export const ruleV1Schema = z.object({
  schemaVersion: z.literal(RULE_SCHEMA_VERSION_V1).optional(),
  walletAddress: z.string().trim().min(1, "walletAddress is required"),
  chainFamily: z.enum(["evm", "stellar"]).optional(),
  network: z.string().optional(),
  maxRiskScore: z.number().finite().min(0).max(100).optional(),
  maxBuyRisk: z.number().finite().min(0).max(100).optional(),
  maxTradePercent: z.number().finite().min(0).max(100).optional(),
  maxTradeValueUsd: z.number().finite().min(0).max(1_000_000_000).optional(),
  maxMemeExposurePercent: z.number().finite().min(0).max(100).optional(),
  maxDailyTransactionValueUsd: z.number().finite().min(0).max(1_000_000_000).optional(),
  maxDailyValueUsd: z.number().finite().min(0).max(1_000_000_000).optional(),
  minLiquidityUsd: z.number().finite().min(0).max(1_000_000_000).optional(),
  maxSingleTokenExposurePercent: z.number().finite().min(0).max(100).optional(),
  maxSlippageBps: z.number().int().min(0).max(10_000).optional(),
  minStableReservePercent: z.number().finite().min(0).max(100).optional(),
  allowedChains: z.array(z.string().trim().min(1)).max(64).optional(),
  blockedAssets: z.array(z.string().trim().min(1)).max(500).optional(),
  blockedTokens: z.array(z.string().trim().min(1)).max(500).optional(),
  blockedIssuers: z.array(z.string().trim().min(1)).max(500).optional(),
  blockedCategories: z.array(z.string().trim().min(1)).max(64).optional(),
  allowedActions: z.array(z.string().trim().min(1)).max(32).optional(),
  autoExecute: z.literal(false).optional(),
  profileId: z.string().optional(),
  version: z.number().int().min(1).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/**
 * Shape of a persisted rule in schema version 1.
 */
export type RuleV1 = z.infer<typeof ruleV1Schema>;
