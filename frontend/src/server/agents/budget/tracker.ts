import type { AgentResult } from "@/server/types";
import {
  type AgentBudgetPolicy,
  DEFAULT_BUDGET_POLICY,
  UPSTREAM_CALL_COSTS,
} from "./policy";

/**
 * Breakdown of spend and upstream call volume for an individual agent.
 */
export interface AgentSpendAccounting {
  spendUsd: number;
  calls: number;
}

/**
 * Complete budget accounting record attached to an agent orchestration run.
 */
export interface RunBudgetAccounting {
  runId: string;
  totalSpendUsd: number;
  totalCalls: number;
  agents: Record<AgentResult["agent"], AgentSpendAccounting>;
  policy: AgentBudgetPolicy;
  exceeded: boolean;
  exceededReason?: "monetary_ceiling" | "call_limit" | "agent_call_limit" | "agent_cost_limit";
}

/**
 * Tracks spend and invocation counts per agent for an active orchestration run.
 */
export class RunBudgetTracker {
  private agentSpend: Map<AgentResult["agent"], number> = new Map();
  private agentCalls: Map<AgentResult["agent"], number> = new Map();
  private exceededReason?: RunBudgetAccounting["exceededReason"];

  readonly runId: string;
  readonly policy: AgentBudgetPolicy;

  constructor(
    runIdOrPolicy: string | AgentBudgetPolicy = "default-run",
    policy: AgentBudgetPolicy = DEFAULT_BUDGET_POLICY,
  ) {
    if (typeof runIdOrPolicy === "object" && runIdOrPolicy !== null) {
      this.runId = "default-run";
      this.policy = runIdOrPolicy;
    } else {
      this.runId = runIdOrPolicy;
      this.policy = policy;
    }
  }

  /**
   * Evaluates whether an agent may issue an upstream call given current limits.
   *
   * @param agent Target agent name.
   * @param estimatedCostUsd Estimated cost of the pending call.
   * @returns Allowed status and rejection reason if blocked.
   */
  canMakeCall(
    agent: AgentResult["agent"],
    estimatedCostUsd = UPSTREAM_CALL_COSTS.default,
  ): { allowed: boolean; reason?: string } {
    if (this.exceededReason === "monetary_ceiling" || this.exceededReason === "call_limit") {
      return { allowed: false, reason: `Run budget exceeded: ${this.exceededReason}` };
    }

    const currentTotalCalls = this.getTotalCalls();
    if (currentTotalCalls >= this.policy.maxCalls) {
      this.exceededReason = "call_limit";
      return { allowed: false, reason: "Run call ceiling exceeded" };
    }

    const currentTotalSpend = this.getTotalSpend();
    if (currentTotalSpend + estimatedCostUsd > this.policy.maxCostUsd) {
      this.exceededReason = "monetary_ceiling";
      return { allowed: false, reason: "Run monetary ceiling exceeded" };
    }

    const agentCalls = this.getAgentCalls(agent);
    const agentMaxCalls = this.policy.perAgentMaxCalls[agent] ?? this.policy.maxCalls;
    if (agentCalls >= agentMaxCalls) {
      return { allowed: false, reason: `Per-agent call ceiling exceeded for ${agent}` };
    }

    const agentSpend = this.getAgentSpend(agent);
    const agentMaxCost = this.policy.perAgentMaxCostUsd[agent] ?? this.policy.maxCostUsd;
    if (agentSpend + estimatedCostUsd > agentMaxCost) {
      return { allowed: false, reason: `Per-agent monetary ceiling exceeded for ${agent}` };
    }

    return { allowed: true };
  }

  /**
   * Records an executed upstream call and aggregates costs.
   *
   * @param agent Target agent name.
   * @param costUsd Incurred cost in USD.
   * @param provider Optional provider name for default rate lookup.
   * @returns Record outcome indicating whether budget constraints were breached.
   */
  recordCall(
    agent: AgentResult["agent"],
    costUsd?: number,
    provider?: string,
  ): { allowed: boolean; reason?: string } {
    const cost =
      costUsd ??
      (provider ? UPSTREAM_CALL_COSTS[provider] ?? UPSTREAM_CALL_COSTS.default : this.policy.callCosts[agent] ?? UPSTREAM_CALL_COSTS.default);
    const check = this.canMakeCall(agent, cost);

    if (!check.allowed) {
      throw new Error(`Call budget exhausted for agent '${agent}': ${check.reason}`);
    }

    const previousCalls = this.agentCalls.get(agent) ?? 0;
    this.agentCalls.set(agent, previousCalls + 1);

    const previousSpend = this.agentSpend.get(agent) ?? 0;
    const nextSpend = Math.round((previousSpend + cost) * 10_000) / 10_000;
    this.agentSpend.set(agent, nextSpend);

    return { allowed: true };
  }

  /**
   * Retrieves aggregated total spend across all agents in USD.
   */
  getTotalSpend(): number {
    let total = 0;
    for (const spend of this.agentSpend.values()) {
      total += spend;
    }
    return Math.round(total * 10_000) / 10_000;
  }

  /**
   * Retrieves total upstream calls across all agents.
   */
  getTotalCalls(): number {
    let total = 0;
    for (const count of this.agentCalls.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Retrieves spend for an individual agent in USD.
   */
  getAgentSpend(agent: AgentResult["agent"]): number {
    return this.agentSpend.get(agent) ?? 0;
  }

  /**
   * Retrieves upstream call count for an individual agent.
   */
  getAgentCalls(agent: AgentResult["agent"]): number {
    return this.agentCalls.get(agent) ?? 0;
  }

  /**
   * Generates a snapshot of the run budget accounting.
   */
  getAccounting(): RunBudgetAccounting {
    const knownAgents: AgentResult["agent"][] = [
      "portfolio",
      "news",
      "social",
      "onchain",
      "decision",
      "execution",
    ];

    const agents = {} as Record<AgentResult["agent"], AgentSpendAccounting>;
    for (const agent of knownAgents) {
      agents[agent] = {
        spendUsd: this.getAgentSpend(agent),
        calls: this.getAgentCalls(agent),
      };
    }

    const totalSpendUsd = this.getTotalSpend();
    const totalCalls = this.getTotalCalls();

    return {
      runId: this.runId,
      totalSpendUsd,
      totalCalls,
      agents,
      policy: this.policy,
      exceeded: this.exceededReason !== undefined,
      exceededReason: this.exceededReason,
    };
  }
}
