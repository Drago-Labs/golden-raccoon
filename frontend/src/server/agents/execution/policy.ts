import type { AgentRecommendedAction, StrategyPolicyResult, UserRule } from "@/server/types";
import { getDefaultRules } from "@/server/rules/defaultRules";
import { evaluateStrategy, type StrategyEnforcerContext } from "@/server/agents/strategy";
import { getChainFamily } from "@/lib/chainIdentity";
import {
  evaluateImmutableBuyBlockers,
  type ImmutableBuySafetySignals,
} from "@/server/autoMode/policy";

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
  simulationStatus?: "not_required" | "pending" | "passed" | "failed" | "unavailable" | "unsupported";
  autoModeBuy?: boolean;
  autoModeBuySafetySignals?: ImmutableBuySafetySignals;
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

function normalized(value?: string) {
  return value?.trim().toLowerCase();
}

function isStellarChain(chain?: string) {
  return getChainFamily(chain) === "stellar";
}

/**
 * Evaluate execution policy using the shared strategy enforcer as the
 * primary enforcement engine, plus execution-specific checks for
 * immutable auto-buy blockers and Stellar issuer/XLM reserve limits.
 */
export function evaluateExecutionPolicy(
  input: ExecutionPolicyInput,
  policy: ExecutionPolicy,
  rules?: UserRule,
): StrategyPolicyResult {
  // 1. Run the shared strategy enforcer for all standard rule checks
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

  const result = evaluateStrategy(context, rules);

  // 2. Append immutable auto-buy blockers (not covered by shared enforcer)
  const immutableBuyBlockers = input.autoModeBuy
    ? evaluateImmutableBuyBlockers(input.autoModeBuySafetySignals)
    : [];

  // 3. Append additional Stellar-specific checks not in the shared enforcer
  //    (allowed-issuer list, XLM reserve minimum)
  const extraViolations: typeof result.violations = [];
  const extraMessages: string[] = [];

  if (isStellarChain(input.network)) {
    // Allowed-issuer list check
    if (input.action === "create_trustline" && typeof input.stellarIssuer === "string") {
      const allowedIssuers = policy.stellar.allowedIssuers;
      if (allowedIssuers && allowedIssuers.length > 0) {
        const normalizedIssuer = input.stellarIssuer.trim().toUpperCase();
        if (!allowedIssuers.map((i) => i.trim().toUpperCase()).includes(normalizedIssuer)) {
          extraMessages.push(`Issuer ${input.stellarIssuer} is not in the allowed issuer list.`);
        }
      }

      // XLM reserve minimum check
      if (
        typeof input.stellarReserveRequiredXlm === "number" &&
        typeof input.stellarCurrentXlmBalance === "number"
      ) {
        const availableXlm = input.stellarCurrentXlmBalance - input.stellarReserveRequiredXlm;
        if (availableXlm < policy.stellar.minXlmReserve) {
          extraMessages.push(
            `Insufficient XLM reserve: ${availableXlm.toFixed(2)} XLM available after trustline, needs at least ${policy.stellar.minXlmReserve} XLM.`,
          );
        }
      }
    }
  }

  for (const blocker of immutableBuyBlockers) {
    extraMessages.push(`Immutable auto-buy blocker: ${blocker.replaceAll("_", " ")}.`);
  }

  return {
    allowed: result.allowed && extraMessages.length === 0,
    violations: result.violations,
    passed: result.passed,
    warnings: result.warnings,
    ruleVersion: result.ruleVersion,
    ruleWalletAddress: result.ruleWalletAddress,
    violationMessages: [...result.violationMessages, ...extraMessages],
  };
}
