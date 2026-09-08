import { z } from "zod";
import { BLOCKABLE_CATEGORIES } from "../presets";
import type { AgentRecommendedAction } from "@/server/types";

export const RULE_SCHEMA_VERSION_V2 = 2 as const;

export const ALLOWED_RULE_ACTIONS = [
  "hold",
  "watch",
  "reduce_exposure",
  "swap_to_stable",
  "avoid",
  "manual_review",
  "prepare_transaction",
  "no_action",
] as const satisfies readonly AgentRecommendedAction[];

const percent = z.number().finite().min(0).max(100);
const usd = z.number().finite().min(0).max(1_000_000_000);

export const ruleV2Schema = z.object({
  schemaVersion: z.literal(RULE_SCHEMA_VERSION_V2),
  walletAddress: z.string().trim().min(1, "walletAddress is required"),
  profileId: z.enum(["conservative", "balanced", "aggressive", "custom"]),
  presetVersion: z.number().int().min(1).default(1),
  maxBuyRisk: percent,
  maxTradePercent: percent,
  maxTradeValueUsd: usd,
  maxDailyValueUsd: usd,
  minLiquidityUsd: usd,
  maxSingleTokenExposurePercent: percent,
  minStableReservePercent: percent,
  maxMemeExposurePercent: percent,
  maxSlippageBps: z.number().int().min(0).max(10_000),
  allowedChains: z.array(z.string().trim().min(1)).min(1, "At least one chain must be allowed").max(64),
  blockedAssets: z.array(z.string().trim().min(1)).max(500),
  blockedCategories: z.array(z.enum(BLOCKABLE_CATEGORIES)).max(64),
  allowedActions: z.array(z.enum(ALLOWED_RULE_ACTIONS)).max(ALLOWED_RULE_ACTIONS.length),
  autoExecute: z.literal(false),
  version: z.number().int().min(1).optional(),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
  maxRiskScore: percent.optional(),
  maxDailyTransactionValueUsd: usd.optional(),
  blockedTokens: z.array(z.string().trim().min(1)).max(500).optional(),
  blockedIssuers: z.array(z.string().trim().min(1)).max(500).optional(),
  chainFamily: z.enum(["evm", "stellar"]).optional(),
  network: z.string().optional(),
});

/**
 * Shape of a persisted rule in schema version 2.
 */
export type RuleV2 = z.infer<typeof ruleV2Schema>;
