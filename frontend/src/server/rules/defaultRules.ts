import type { UserRule } from "../types";
import { isStellarAddress, resolveChainContext, type ChainContext } from "@/lib/chainIdentity";
import { CURRENT_RULE_SCHEMA_VERSION, type CurrentRule } from "./schema";
import { STRATEGY_PRESET_VERSION, STRATEGY_PRESETS } from "./presets";

/**
 * Returns default rules expressed in current schema version 2 seeded from the balanced preset.
 */
export function getDefaultRules(
  walletAddress = "0xDemoWallet",
  contextInput: Partial<ChainContext> = {},
): CurrentRule & ChainContext & UserRule {
  const context = resolveChainContext({
    ...contextInput,
    network: contextInput.network ?? (isStellarAddress(walletAddress) ? "stellar-testnet" : "legacy-evm"),
    identifier: walletAddress,
  });

  const balanced = STRATEGY_PRESETS.balanced;
  const now = new Date().toISOString();

  return {
    ...context,
    schemaVersion: CURRENT_RULE_SCHEMA_VERSION,
    walletAddress,
    profileId: "balanced",
    presetVersion: STRATEGY_PRESET_VERSION,
    ...balanced.limits,
    allowedChains: [...balanced.allowedChains],
    blockedAssets: [],
    blockedIssuers: [],
    blockedCategories: [...balanced.blockedCategories],
    allowedActions: [...balanced.allowedActions],
    autoExecute: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
    maxRiskScore: balanced.limits.maxBuyRisk,
    maxDailyTransactionValueUsd: balanced.limits.maxDailyValueUsd,
    blockedTokens: [],
  };
}

