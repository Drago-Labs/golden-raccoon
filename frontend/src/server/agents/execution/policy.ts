import type { AgentRecommendedAction, UserRule } from "@/server/types";
import { getDefaultRules } from "@/server/rules/defaultRules";
import { isIncidentMode } from "@/server/recovery/policy";

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
  /** V3: incident mode disables NEW execution preparation (visibility-only for existing in-flight previews). */
  incidentMode: boolean;
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
};

function uniqueStrings(values: string[] | undefined, fallback: string[]) {
  return Array.from(new Set((values?.length ? values : fallback).map((value) => value.trim()).filter(Boolean)));
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
    allowedActions: new Set(safeRules.allowedActions ?? defaultRules.allowedActions ?? ["reduce_exposure", "swap_to_stable", "prepare_transaction", "watch", "hold", "no_action"]),
    walletAddress: safeRules.walletAddress,
    incidentMode: isIncidentMode(),
  };
}

function normalized(value?: string) {
  return value?.trim().toLowerCase();
}

export function evaluateExecutionPolicy(input: ExecutionPolicyInput, policy: ExecutionPolicy) {
  const violations: string[] = [];
  const tradeAction = input.action === "swap_to_stable" || input.action === "reduce_exposure" || input.action === "prepare_transaction";

  if (policy.autoExecute) {
    violations.push("Auto-execute is disabled. User wallet approval is mandatory.");
  }

  if (policy.incidentMode) {
    violations.push("Incident mode is active. New execution preparation is blocked. Existing previews expire; re-prepare after incident clears.");
  }

  if (!policy.allowedActions.has(input.action)) {
    violations.push(`Action ${input.action} is not allowed by execution policy.`);
  }

  if (input.action === "avoid" || input.action === "manual_review") {
    violations.push(`Action ${input.action.replaceAll("_", " ")} cannot prepare a transaction until the user reviews the risk.`);
  }

  if (input.percent > policy.maxTradePercent) {
    violations.push(`Requested ${input.percent}% exceeds max trade percent ${policy.maxTradePercent}%.`);
  }

  if (tradeAction && input.riskScore > policy.maxRiskScoreForTrade) {
    violations.push(`Risk score ${input.riskScore} exceeds max trade risk threshold ${policy.maxRiskScoreForTrade}.`);
  }

  if (typeof input.estimatedValueUsd === "number" && input.estimatedValueUsd > policy.maxDailyTransactionValueUsd) {
    violations.push(`Estimated value $${Math.round(input.estimatedValueUsd).toLocaleString("en-US")} exceeds daily transaction value limit $${policy.maxDailyTransactionValueUsd.toLocaleString("en-US")}.`);
  }

  if (typeof input.slippageBps === "number" && input.slippageBps > policy.maxSlippageBps) {
    violations.push(`Slippage ${input.slippageBps} bps exceeds max slippage ${policy.maxSlippageBps} bps.`);
  }

  if (input.network && policy.allowedChains.length > 0 && !policy.allowedChains.map(normalized).includes(normalized(input.network))) {
    violations.push(`Network ${input.network} is not in allowed chains.`);
  }

  const blockedTokens = policy.blockedTokens.map(normalized);
  for (const token of [input.fromToken, input.toToken]) {
    if (token && blockedTokens.includes(normalized(token))) {
      violations.push(`Token ${token} is blocked by user policy.`);
    }
  }

  if (input.simulationStatus === "failed") {
    violations.push("Simulation failed. Confirmation is blocked until the issue is resolved.");
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

export function getBlockedReason(action: AgentRecommendedAction, percent: number, riskScore: number, policy: ExecutionPolicy) {
  return evaluateExecutionPolicy({ action, percent, riskScore }, policy).violations[0];
}
