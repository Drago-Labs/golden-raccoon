import type { UserRule } from "../types";
import { isStellarAddress, resolveChainContext, type ChainContext } from "@/lib/chainIdentity";

export function getDefaultRules(
  walletAddress = "0xDemoWallet",
  contextInput: Partial<ChainContext> = {},
): UserRule {
  const context = resolveChainContext({
    ...contextInput,
    network: contextInput.network ?? (isStellarAddress(walletAddress) ? "stellar-testnet" : "legacy-evm"),
    identifier: walletAddress,
  });

  return {
    ...context,
    walletAddress,
    maxRiskScore: 80,
    maxTradePercent: 20,
    maxMemeExposurePercent: 10,
    maxDailyTransactionValueUsd: 1_000,
    maxSlippageBps: 100,
    minStableReservePercent: 15,
    allowedChains: ["GOAT Network", "Base", "Ethereum", "Arbitrum", "Optimism", "Polygon", "BSC", "Stellar Testnet", "Stellar Pubnet"],
    blockedTokens: [],
    blockedIssuers: [],
    blockedCategories: [],
    allowedActions: ["hold", "watch", "reduce_exposure", "swap_to_stable", "prepare_transaction", "no_action"],
    autoExecute: false,
    version: 1,
    createdAt: new Date().toISOString(),
  };
}
