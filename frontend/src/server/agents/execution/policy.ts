import type { AgentRecommendedAction, UserRule } from "@/server/types";
import { getDefaultRules } from "@/server/rules/defaultRules";

export type ExecutionPolicy = {
  autoExecute: false;
  maxTradePercent: number;
  maxRiskScoreForTrade: number;
  maxMemeExposurePercent: number;
  defaultSlippageBps: number;
  allowedActions: Set<AgentRecommendedAction>;
  walletAddress: string;
};

export function buildExecutionPolicy(rules?: UserRule): ExecutionPolicy {
  const safeRules = rules ?? getDefaultRules();

  return {
    autoExecute: false,
    maxTradePercent: safeRules.maxTradePercent,
    maxRiskScoreForTrade: safeRules.maxRiskScore,
    maxMemeExposurePercent: safeRules.maxMemeExposurePercent,
    defaultSlippageBps: 100,
    allowedActions: new Set(["reduce_exposure", "swap_to_stable", "prepare_transaction", "watch", "hold", "no_action"]),
    walletAddress: safeRules.walletAddress,
  };
}

export function getBlockedReason(action: AgentRecommendedAction, percent: number, riskScore: number, policy: ExecutionPolicy) {
  if (!policy.allowedActions.has(action)) {
    return `Action ${action} is not allowed by execution policy.`;
  }

  if (action === "avoid" || action === "manual_review") {
    return `Action ${action.replaceAll("_", " ")} cannot prepare a transaction until the user reviews the risk.`;
  }

  if (percent > policy.maxTradePercent) {
    return `Requested ${percent}% exceeds max trade percent ${policy.maxTradePercent}%.`;
  }

  if ((action === "swap_to_stable" || action === "reduce_exposure" || action === "prepare_transaction") && riskScore > policy.maxRiskScoreForTrade) {
    return `Risk score ${riskScore} exceeds max trade risk threshold ${policy.maxRiskScoreForTrade}.`;
  }

  return undefined;
}
