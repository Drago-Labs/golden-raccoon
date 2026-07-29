import type { AgentRecommendedAction, StrategyPolicyResult, UserRule } from "@/server/types";
import { getDefaultRules } from "@/server/rules/defaultRules";
import { evaluateStrategy, type StrategyEnforcerContext } from "@/server/agents/strategy";

export type StellarPolicyOverrides = {
  allowedIssuers?: string[];
  blockClawbackIssuers: boolean;
  blockRevocableIssuers: boolean;
  maxTrustlineReserveXlm: number;
  minXlmReserve: number;
};

export type ExecutionPolicy = {
  autoExecute: false;
  maxTradePercent: number;
  maxRiskScoreForTrade: number;
  maxMemeExposurePercent: number;
  maxDailyTransactionValueUsd: number;
  maxSlippageBps: number;
  allowedChains: string[];
  blockedTokens: string[];
  allowedActions: Set<AgentRecommendedAction>;
  walletAddress: string;
  stellar: StellarPolicyOverrides;
};

export type ExecutionPolicyInput = {
  action: AgentRecommendedAction;
  percent: number;
  riskScore: number;
  network?: string;
  fromToken?: string;
  toToken?: string;
  estimatedValueUsd?: number;
  slippageBps?: number;
  simulationStatus?: "not_required" | "pending" | "passed" | "failed" | "unavailable";
  // Stellar-specific trustline fields
  stellarIssuer?: string;
  stellarIssuerClawback?: boolean;
  stellarIssuerRevocable?: boolean;
  stellarReserveRequiredXlm?: number;
  stellarCurrentXlmBalance?: number;
  stellarQuoteStatus?: "fresh" | "stale" | "unavailable" | "simulated";
};

function uniqueStrings(values: string[] | undefined, fallback: string[]) {
  return Array.from(new Set((values?.length ? values : fallback).map((value) => value.trim()).filter(Boolean)));
}

function getDefaultStellarPolicy(): StellarPolicyOverrides {
  return {
    allowedIssuers: undefined,
    blockClawbackIssuers: true,
    blockRevocableIssuers: true,
    maxTrustlineReserveXlm: 5,
    minXlmReserve: 1.5,
  };
}

export function buildExecutionPolicy(rules?: UserRule): ExecutionPolicy {
  const safeRules = rules ?? getDefaultRules();
  const defaultRules = getDefaultRules(safeRules.walletAddress);

  return {
    autoExecute: false,
    maxTradePercent: safeRules.maxTradePercent,
    maxRiskScoreForTrade: safeRules.maxRiskScore,
    maxMemeExposurePercent: safeRules.maxMemeExposurePercent,
    maxDailyTransactionValueUsd: safeRules.maxDailyTransactionValueUsd ?? defaultRules.maxDailyTransactionValueUsd ?? 1_000,
    maxSlippageBps: safeRules.maxSlippageBps ?? defaultRules.maxSlippageBps ?? 100,
    allowedChains: uniqueStrings(safeRules.allowedChains, defaultRules.allowedChains ?? ["GOAT Network"]),
    blockedTokens: uniqueStrings(safeRules.blockedTokens, []),
    allowedActions: new Set(safeRules.allowedActions ?? defaultRules.allowedActions ?? ["reduce_exposure", "swap_to_stable", "prepare_transaction", "create_trustline", "watch", "hold", "no_action"]),
    walletAddress: safeRules.walletAddress,
    stellar: {
      ...getDefaultStellarPolicy(),
      allowedIssuers: safeRules.blockedIssuers?.length ? undefined : getDefaultStellarPolicy().allowedIssuers,
    },
  };
}

/**
 * Evaluate execution policy using the shared strategy enforcer.
 * Returns the legacy { allowed, violations } shape PLUS structured
 * policy decisions so the UI can show which rule blocked/changed the
 * recommendation.
 */
export function evaluateExecutionPolicy(
  input: ExecutionPolicyInput,
  _policy: ExecutionPolicy,
  rules?: UserRule,
): StrategyPolicyResult {
  const context: StrategyEnforcerContext = {
    action: input.action,
    riskScore: input.riskScore,
    percent: input.percent,
    estimatedValueUsd: input.estimatedValueUsd,
    network: input.network,
    fromToken: input.fromToken,
    toToken: input.toToken,
    slippageBps: input.slippageBps,
    simulationStatus: input.simulationStatus,
    stellarIssuer: input.stellarIssuer,
    stellarIssuerClawback: input.stellarIssuerClawback,
    stellarIssuerRevocable: input.stellarIssuerRevocable,
    stellarReserveRequiredXlm: input.stellarReserveRequiredXlm,
    stellarCurrentXlmBalance: input.stellarCurrentXlmBalance,
    stellarQuoteStatus: input.stellarQuoteStatus,
    phase: "execution",
  };

  // Note: _policy (ExecutionPolicy) is kept for backward compatibility.
  // All enforcement logic now lives in evaluateStrategy() for shared use
  // by both the Decision Agent and the Execution Agent.
  return evaluateStrategy(context, rules);
}
