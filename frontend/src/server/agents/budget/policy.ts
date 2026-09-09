import type { AgentResult } from "@/server/types";

/**
 * Configuration options for agent run budgets.
 */
export interface AgentBudgetConfig {
  deadlineMs?: number;
  maxDurationMs?: number;
  maxCostUsd?: number;
  maxTotalSpendUsd?: number;
  maxCalls?: number;
  maxTotalCalls?: number;
  perAgentMaxCalls?: Partial<Record<AgentResult["agent"], number>>;
  perAgentMaxCostUsd?: Partial<Record<AgentResult["agent"], number>>;
  perAgent?: Partial<Record<AgentResult["agent"], { maxCalls?: number; maxSpendUsd?: number }>>;
  callCosts?: Partial<Record<AgentResult["agent"], number>>;
}

/**
 * Resolved and immutable runtime budget policy.
 */
export interface AgentBudgetPolicy {
  deadlineMs: number;
  maxDurationMs: number;
  maxCostUsd: number;
  maxTotalSpendUsd: number;
  maxCalls: number;
  maxTotalCalls: number;
  perAgentMaxCalls: Record<AgentResult["agent"], number>;
  perAgentMaxCostUsd: Record<AgentResult["agent"], number>;
  perAgent: Record<AgentResult["agent"], { maxCalls: number; maxSpendUsd: number }>;
  callCosts: Record<AgentResult["agent"], number>;
}

/**
 * Estimated cost per upstream provider call in USD.
 */
export const UPSTREAM_CALL_COSTS: Record<string, number> = {
  goplus: 0.005,
  dexscreener: 0.002,
  rss: 0.001,
  twitter: 0.005,
  telegram: 0.003,
  rpc: 0.001,
  default: 0.002,
};

const DEFAULT_CALL_COSTS: Record<AgentResult["agent"], number> = {
  portfolio: 0.005,
  onchain: 0.015,
  news: 0.008,
  social: 0.008,
  decision: 0.002,
  execution: 0.010,
};

/**
 * Documented default budget policies for agent orchestration runs.
 */
export const DEFAULT_BUDGET_POLICY: AgentBudgetPolicy = {
  deadlineMs: 10_000,
  maxDurationMs: 10_000,
  maxCostUsd: 0.50,
  maxTotalSpendUsd: 0.50,
  maxCalls: 20,
  maxTotalCalls: 20,
  perAgentMaxCalls: {
    portfolio: 5,
    onchain: 8,
    news: 6,
    social: 6,
    decision: 2,
    execution: 4,
  },
  perAgentMaxCostUsd: {
    portfolio: 0.10,
    onchain: 0.15,
    news: 0.10,
    social: 0.10,
    decision: 0.05,
    execution: 0.10,
  },
  perAgent: {
    portfolio: { maxCalls: 5, maxSpendUsd: 0.10 },
    onchain: { maxCalls: 8, maxSpendUsd: 0.15 },
    news: { maxCalls: 6, maxSpendUsd: 0.10 },
    social: { maxCalls: 6, maxSpendUsd: 0.10 },
    decision: { maxCalls: 2, maxSpendUsd: 0.05 },
    execution: { maxCalls: 4, maxSpendUsd: 0.10 },
  },
  callCosts: DEFAULT_CALL_COSTS,
};

/**
 * Resolves configuration into an immutable budget policy with documented defaults.
 *
 * @param config Optional partial budget configuration overrides.
 * @returns Fully resolved AgentBudgetPolicy instance.
 */
export function resolveBudgetPolicy(config?: Partial<AgentBudgetConfig>): AgentBudgetPolicy {
  const deadlineMs =
    typeof config?.deadlineMs === "number" && config.deadlineMs > 0
      ? config.deadlineMs
      : typeof config?.maxDurationMs === "number" && config.maxDurationMs > 0
        ? config.maxDurationMs
        : DEFAULT_BUDGET_POLICY.deadlineMs;

  const maxCostUsd =
    typeof config?.maxCostUsd === "number" && config.maxCostUsd > 0
      ? config.maxCostUsd
      : typeof config?.maxTotalSpendUsd === "number" && config.maxTotalSpendUsd > 0
        ? config.maxTotalSpendUsd
        : DEFAULT_BUDGET_POLICY.maxCostUsd;

  const maxCalls =
    typeof config?.maxCalls === "number" && config.maxCalls > 0
      ? config.maxCalls
      : typeof config?.maxTotalCalls === "number" && config.maxTotalCalls > 0
        ? config.maxTotalCalls
        : DEFAULT_BUDGET_POLICY.maxCalls;

  const perAgentMaxCalls: Record<AgentResult["agent"], number> = {
    ...DEFAULT_BUDGET_POLICY.perAgentMaxCalls,
    ...(config?.perAgentMaxCalls ?? {}),
  };

  const perAgentMaxCostUsd: Record<AgentResult["agent"], number> = {
    ...DEFAULT_BUDGET_POLICY.perAgentMaxCostUsd,
    ...(config?.perAgentMaxCostUsd ?? {}),
  };

  if (config?.perAgent) {
    for (const [agentKey, limits] of Object.entries(config.perAgent)) {
      const agent = agentKey as AgentResult["agent"];
      if (typeof limits?.maxCalls === "number") {
        perAgentMaxCalls[agent] = limits.maxCalls;
      }
      if (typeof limits?.maxSpendUsd === "number") {
        perAgentMaxCostUsd[agent] = limits.maxSpendUsd;
      }
    }
  }

  const perAgent: Record<AgentResult["agent"], { maxCalls: number; maxSpendUsd: number }> = {
    portfolio: { maxCalls: perAgentMaxCalls.portfolio, maxSpendUsd: perAgentMaxCostUsd.portfolio },
    onchain: { maxCalls: perAgentMaxCalls.onchain, maxSpendUsd: perAgentMaxCostUsd.onchain },
    news: { maxCalls: perAgentMaxCalls.news, maxSpendUsd: perAgentMaxCostUsd.news },
    social: { maxCalls: perAgentMaxCalls.social, maxSpendUsd: perAgentMaxCostUsd.social },
    decision: { maxCalls: perAgentMaxCalls.decision, maxSpendUsd: perAgentMaxCostUsd.decision },
    execution: { maxCalls: perAgentMaxCalls.execution, maxSpendUsd: perAgentMaxCostUsd.execution },
  };

  const callCosts: Record<AgentResult["agent"], number> = {
    ...DEFAULT_CALL_COSTS,
    ...(config?.callCosts ?? {}),
  };

  return {
    deadlineMs,
    maxDurationMs: deadlineMs,
    maxCostUsd,
    maxTotalSpendUsd: maxCostUsd,
    maxCalls,
    maxTotalCalls: maxCalls,
    perAgentMaxCalls,
    perAgentMaxCostUsd,
    perAgent,
    callCosts,
  };
}
